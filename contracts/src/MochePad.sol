// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/*
 * MochePad — bonding-curve token launchpad for EVM chains (Elysium, Robinhood Chain).
 *
 * Every launch mints a fixed 1,000,000,000-token ERC-20. `curveSupply` of it is sold on a
 * constant-product curve with virtual reserves against the chain's native coin (HYPE on
 * Elysium, ETH on Robinhood Chain). When the curve sells out, the raised native coin and the
 * remaining tokens are deposited into a Uniswap V2 pair and the LP tokens are burned, so the
 * liquidity is locked permanently.
 *
 * Trading fee: chosen by the creator (1–3%), split 50/50 between the creator and the platform.
 * Optional launch protection: the fee starts at 10% and falls linearly to the creator's fee
 * over 5 minutes.
 *
 * The owner can only change the treasury, pause new launches and set the curve parameters for
 * FUTURE launches. The owner cannot move user funds or change an existing curve.
 *
 * UNAUDITED. Use at your own risk.
 */

interface IUniswapV2Factory {
    function getPair(address a, address b) external view returns (address);
    function createPair(address a, address b) external returns (address);
}

interface IUniswapV2Pair {
    function mint(address to) external returns (uint256);
}

interface IWETH {
    function deposit() external payable;
    function transfer(address to, uint256 value) external returns (bool);
}

contract MocheToken {
    string public name;
    string public symbol;
    string public metadataURI;
    uint8 public constant decimals = 18;
    uint256 public constant totalSupply = 1_000_000_000 ether;

    address public immutable pad;
    address public immutable pair;
    bool public graduated;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    error OnlyPad();
    error PairLocked();
    error Balance();
    error Allowance();

    constructor(string memory name_, string memory symbol_, string memory uri_, address pair_) {
        name = name_;
        symbol = symbol_;
        metadataURI = uri_;
        pad = msg.sender;
        pair = pair_;
        balanceOf[msg.sender] = totalSupply;
        emit Transfer(address(0), msg.sender, totalSupply);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            if (allowed < value) revert Allowance();
            unchecked { allowance[from][msg.sender] = allowed - value; }
        }
        _transfer(from, to, value);
        return true;
    }

    /// @dev Used by the pad to take tokens back on a curve sell (saves the seller an approval).
    ///      Only works while the token is still on its curve.
    function padPull(address from, uint256 value) external {
        if (msg.sender != pad || graduated) revert OnlyPad();
        _transfer(from, pad, value);
    }

    function markGraduated() external {
        if (msg.sender != pad) revert OnlyPad();
        graduated = true;
    }

    function _transfer(address from, address to, uint256 value) internal {
        // Nobody but the pad may fund the Uniswap pair before graduation, so the pool price
        // cannot be manipulated ahead of the liquidity deposit.
        if (!graduated && to == pair && from != pad) revert PairLocked();
        uint256 bal = balanceOf[from];
        if (bal < value) revert Balance();
        unchecked {
            balanceOf[from] = bal - value;
            balanceOf[to] += value;
        }
        emit Transfer(from, to, value);
    }
}

contract MochePad {
    uint256 public constant SUPPLY = 1_000_000_000 ether;
    uint16 public constant MIN_FEE_BPS = 100;
    uint16 public constant MAX_FEE_BPS = 300;
    uint16 public constant PROTECTION_START_BPS = 1000;
    uint32 public constant PROTECTION_SECONDS = 300;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    IUniswapV2Factory public immutable v2Factory;
    address public immutable weth;

    address public owner;
    address public treasury;
    bool public launchesPaused;

    // Parameters applied to new launches.
    uint128 public virtualNative;
    uint128 public virtualToken;
    uint128 public curveSupply;

    struct Curve {
        address creator;
        uint16 feeBps;
        bool protection;
        bool graduated;
        uint40 createdAt;
        uint128 vNative;
        uint128 vToken;
        uint128 realNative;
        uint128 realToken;
        uint128 creatorFees;
        uint128 lpTokens;
    }

    struct TokenInfo {
        address token;
        string name;
        string symbol;
        string metadataURI;
        address pair;
        Curve curve;
    }

    mapping(address => Curve) public curves;
    address[] public tokens;
    mapping(address => address[]) internal createdBy;
    uint256 public platformFees;

    uint256 private locked = 1;

    event TokenCreated(address indexed token, address indexed creator, string name, string symbol, string metadataURI, uint16 feeBps, bool protection, address pair);
    event Trade(address indexed token, address indexed trader, bool isBuy, uint256 nativeAmount, uint256 tokenAmount, uint256 fee, uint256 vNative, uint256 vToken);
    event Graduated(address indexed token, address indexed pair, uint256 nativeAmount, uint256 tokenAmount, uint256 liquidity);
    event CreatorFeesClaimed(address indexed token, address indexed creator, uint256 amount);
    event PlatformFeesClaimed(address indexed to, uint256 amount);
    event ParamsUpdated(uint128 virtualNative, uint128 virtualToken, uint128 curveSupply);
    event TreasuryUpdated(address treasury);
    event OwnerUpdated(address owner);
    event LaunchesPaused(bool paused);

    error NotOwner();
    error Reentrancy();
    error Paused();
    error BadParams();
    error BadFee();
    error BadName();
    error UnknownToken();
    error AlreadyGraduated();
    error Slippage();
    error ZeroAmount();
    error NotCreator();
    error SendFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (locked != 1) revert Reentrancy();
        locked = 2;
        _;
        locked = 1;
    }

    constructor(address v2Factory_, address weth_, address treasury_, uint128 virtualNative_, uint128 virtualToken_, uint128 curveSupply_) {
        if (v2Factory_.code.length == 0 || weth_.code.length == 0 || treasury_ == address(0)) revert BadParams();
        v2Factory = IUniswapV2Factory(v2Factory_);
        weth = weth_;
        owner = msg.sender;
        treasury = treasury_;
        _setParams(virtualNative_, virtualToken_, curveSupply_);
        emit OwnerUpdated(msg.sender);
        emit TreasuryUpdated(treasury_);
    }

    // ------------------------------------------------------------------ launch

    function createToken(string calldata name, string calldata symbol, string calldata uri, uint16 feeBps, bool protection, uint256 minTokensOut)
        external
        payable
        nonReentrant
        returns (address token)
    {
        if (launchesPaused) revert Paused();
        if (feeBps < MIN_FEE_BPS || feeBps > MAX_FEE_BPS) revert BadFee();
        uint256 nl = bytes(name).length;
        uint256 sl = bytes(symbol).length;
        if (nl == 0 || nl > 32 || sl < 2 || sl > 10 || bytes(uri).length > 200) revert BadName();

        // Predict the token address so the pair can be created before the token exists.
        address predicted = _nextAddress();
        address pair = v2Factory.getPair(predicted, weth);
        if (pair == address(0)) pair = v2Factory.createPair(predicted, weth);

        token = address(new MocheToken(name, symbol, uri, pair));
        if (token != predicted) revert BadParams();

        curves[token] = Curve({
            creator: msg.sender,
            feeBps: feeBps,
            protection: protection,
            graduated: false,
            createdAt: uint40(block.timestamp),
            vNative: virtualNative,
            vToken: virtualToken,
            realNative: 0,
            realToken: curveSupply,
            creatorFees: 0,
            lpTokens: uint128(SUPPLY - curveSupply)
        });
        tokens.push(token);
        createdBy[msg.sender].push(token);
        emit TokenCreated(token, msg.sender, name, symbol, uri, feeBps, protection, pair);

        // Optional creator buy, at the base fee (no launch protection for the creator's own buy).
        if (msg.value > 0) _buy(token, msg.value, minTokensOut, feeBps);
    }

    // ------------------------------------------------------------------ trading

    function buy(address token, uint256 minTokensOut) external payable nonReentrant returns (uint256 out) {
        Curve storage c = curves[token];
        if (c.creator == address(0)) revert UnknownToken();
        out = _buy(token, msg.value, minTokensOut, currentFeeBps(token));
    }

    function sell(address token, uint256 tokenAmount, uint256 minNativeOut) external nonReentrant returns (uint256 nativeOut) {
        Curve storage c = curves[token];
        if (c.creator == address(0)) revert UnknownToken();
        if (c.graduated) revert AlreadyGraduated();
        if (tokenAmount == 0) revert ZeroAmount();

        uint256 gross = (uint256(c.vNative) * tokenAmount) / (uint256(c.vToken) + tokenAmount);
        if (gross > c.realNative) gross = c.realNative;
        uint256 fee = (gross * currentFeeBps(token)) / 10_000;
        nativeOut = gross - fee;
        if (nativeOut < minNativeOut || nativeOut == 0) revert Slippage();

        c.vNative -= uint128(gross);
        c.vToken += uint128(tokenAmount);
        c.realNative -= uint128(gross);
        c.realToken += uint128(tokenAmount);
        _splitFee(c, fee);

        MocheToken(token).padPull(msg.sender, tokenAmount);
        emit Trade(token, msg.sender, false, nativeOut, tokenAmount, fee, c.vNative, c.vToken);
        _send(msg.sender, nativeOut);
    }

    function _buy(address token, uint256 value, uint256 minOut, uint256 bps) internal returns (uint256 out) {
        Curve storage c = curves[token];
        if (c.graduated) revert AlreadyGraduated();
        if (value == 0) revert ZeroAmount();

        uint256 fee = (value * bps) / 10_000;
        uint256 net = value - fee;
        out = (uint256(c.vToken) * net) / (uint256(c.vNative) + net);
        uint256 refund;

        if (out >= c.realToken) {
            // Last buy: take only what is left on the curve and refund the rest.
            out = c.realToken;
            uint256 netUsed = _ceilDiv(uint256(c.vNative) * out, uint256(c.vToken) - out);
            uint256 grossUsed = _ceilDiv(netUsed * 10_000, 10_000 - bps);
            if (grossUsed > value) grossUsed = value;
            fee = grossUsed - netUsed;
            net = netUsed;
            refund = value - grossUsed;
        }
        if (out < minOut || out == 0) revert Slippage();

        c.vNative += uint128(net);
        c.vToken -= uint128(out);
        c.realNative += uint128(net);
        c.realToken -= uint128(out);
        _splitFee(c, fee);

        MocheToken(token).transfer(msg.sender, out);
        emit Trade(token, msg.sender, true, value - refund, out, fee, c.vNative, c.vToken);

        if (c.realToken == 0) _graduate(token, c);
        if (refund > 0) _send(msg.sender, refund);
    }

    function _graduate(address token, Curve storage c) internal {
        c.graduated = true;
        uint256 nativeAmount = c.realNative;
        uint256 tokenAmount = c.lpTokens;
        address pair = MocheToken(token).pair();

        IWETH(weth).deposit{value: nativeAmount}();
        if (!IWETH(weth).transfer(pair, nativeAmount)) revert SendFailed();
        MocheToken(token).transfer(pair, tokenAmount);
        MocheToken(token).markGraduated();
        uint256 liquidity = IUniswapV2Pair(pair).mint(DEAD);

        c.realNative = 0;
        emit Graduated(token, pair, nativeAmount, tokenAmount, liquidity);
    }

    function _splitFee(Curve storage c, uint256 fee) internal {
        uint256 creatorShare = fee / 2;
        c.creatorFees += uint128(creatorShare);
        platformFees += fee - creatorShare;
    }

    // ------------------------------------------------------------------ fees

    function claimCreatorFees(address token) external nonReentrant {
        Curve storage c = curves[token];
        if (msg.sender != c.creator) revert NotCreator();
        uint256 amount = c.creatorFees;
        if (amount == 0) revert ZeroAmount();
        c.creatorFees = 0;
        emit CreatorFeesClaimed(token, msg.sender, amount);
        _send(msg.sender, amount);
    }

    function claimPlatformFees() external nonReentrant {
        uint256 amount = platformFees;
        if (amount == 0) revert ZeroAmount();
        platformFees = 0;
        emit PlatformFeesClaimed(treasury, amount);
        _send(treasury, amount);
    }

    // ------------------------------------------------------------------ views

    function currentFeeBps(address token) public view returns (uint256) {
        Curve storage c = curves[token];
        if (!c.protection) return c.feeBps;
        uint256 elapsed = block.timestamp - c.createdAt;
        if (elapsed >= PROTECTION_SECONDS) return c.feeBps;
        uint256 span = PROTECTION_START_BPS - c.feeBps;
        return PROTECTION_START_BPS - (span * elapsed) / PROTECTION_SECONDS;
    }

    function quoteBuy(address token, uint256 value) external view returns (uint256 out, uint256 fee, uint256 refund) {
        Curve storage c = curves[token];
        if (c.creator == address(0) || c.graduated || value == 0) return (0, 0, 0);
        uint256 bps = currentFeeBps(token);
        fee = (value * bps) / 10_000;
        uint256 net = value - fee;
        out = (uint256(c.vToken) * net) / (uint256(c.vNative) + net);
        if (out >= c.realToken) {
            out = c.realToken;
            uint256 netUsed = _ceilDiv(uint256(c.vNative) * out, uint256(c.vToken) - out);
            uint256 grossUsed = _ceilDiv(netUsed * 10_000, 10_000 - bps);
            if (grossUsed > value) grossUsed = value;
            fee = grossUsed - netUsed;
            refund = value - grossUsed;
        }
    }

    function quoteSell(address token, uint256 tokenAmount) external view returns (uint256 nativeOut, uint256 fee) {
        Curve storage c = curves[token];
        if (c.creator == address(0) || c.graduated || tokenAmount == 0) return (0, 0);
        uint256 gross = (uint256(c.vNative) * tokenAmount) / (uint256(c.vToken) + tokenAmount);
        if (gross > c.realNative) gross = c.realNative;
        fee = (gross * currentFeeBps(token)) / 10_000;
        nativeOut = gross - fee;
    }

    function tokensLength() external view returns (uint256) {
        return tokens.length;
    }

    function tokensCreatedBy(address creator) external view returns (address[] memory) {
        return createdBy[creator];
    }

    /// @notice Newest-first page of launches with everything the UI needs.
    function getTokens(uint256 offset, uint256 limit) external view returns (TokenInfo[] memory list) {
        uint256 n = tokens.length;
        if (offset >= n) return new TokenInfo[](0);
        uint256 count = n - offset < limit ? n - offset : limit;
        list = new TokenInfo[](count);
        for (uint256 i = 0; i < count; i++) list[i] = getToken(tokens[n - 1 - offset - i]);
    }

    function getToken(address token) public view returns (TokenInfo memory info) {
        MocheToken t = MocheToken(token);
        info = TokenInfo(token, t.name(), t.symbol(), t.metadataURI(), t.pair(), curves[token]);
    }

    // ------------------------------------------------------------------ admin

    function setParams(uint128 virtualNative_, uint128 virtualToken_, uint128 curveSupply_) external onlyOwner {
        _setParams(virtualNative_, virtualToken_, curveSupply_);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert BadParams();
        treasury = treasury_;
        emit TreasuryUpdated(treasury_);
    }

    function setLaunchesPaused(bool paused) external onlyOwner {
        launchesPaused = paused;
        emit LaunchesPaused(paused);
    }

    function transferOwnership(address owner_) external onlyOwner {
        if (owner_ == address(0)) revert BadParams();
        owner = owner_;
        emit OwnerUpdated(owner_);
    }

    function _setParams(uint128 vN, uint128 vT, uint128 cs) internal {
        if (vN == 0 || cs == 0 || cs >= SUPPLY || vT <= cs) revert BadParams();
        // The price at which liquidity is seeded must match the curve's final price (±2%),
        // so graduation does not open an arbitrage gap.
        uint256 vTEnd = uint256(vT) - cs;
        uint256 vNEnd = _ceilDiv(uint256(vN) * vT, vTEnd);
        uint256 raised = vNEnd - vN;
        uint256 lp = SUPPLY - cs;
        uint256 lhs = raised * vTEnd; // LP price  = raised / lp
        uint256 rhs = vNEnd * lp;     // curve price = vNEnd / vTEnd
        uint256 diff = lhs > rhs ? lhs - rhs : rhs - lhs;
        if (diff * 50 > rhs) revert BadParams();
        virtualNative = vN;
        virtualToken = vT;
        curveSupply = cs;
        emit ParamsUpdated(vN, vT, cs);
    }

    // ------------------------------------------------------------------ utils

    function _send(address to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert SendFailed();
    }

    function _ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }

    /// @dev CREATE address of this contract's next deployment (RLP of [address, nonce]).
    function _nextAddress() internal view returns (address) {
        uint256 nonce = tokens.length + 1; // contract nonces start at 1 and only tokens are created
        bytes memory rlp;
        if (nonce <= 0x7f) rlp = abi.encodePacked(bytes1(0xd6), bytes1(0x94), address(this), uint8(nonce));
        else if (nonce <= 0xff) rlp = abi.encodePacked(bytes1(0xd7), bytes1(0x94), address(this), bytes1(0x81), uint8(nonce));
        else if (nonce <= 0xffff) rlp = abi.encodePacked(bytes1(0xd8), bytes1(0x94), address(this), bytes1(0x82), uint16(nonce));
        else if (nonce <= 0xffffff) rlp = abi.encodePacked(bytes1(0xd9), bytes1(0x94), address(this), bytes1(0x83), uint24(nonce));
        else rlp = abi.encodePacked(bytes1(0xda), bytes1(0x94), address(this), bytes1(0x84), uint32(nonce));
        return address(uint160(uint256(keccak256(rlp))));
    }

    receive() external payable {
        // Only WETH unwraps would send native here; none are used, so reject stray sends.
        revert();
    }
}
