// Compiles src/MochePad.sol with solc 0.8.24 (EVM "paris": no PUSH0, runs on every Arbitrum Orbit chain)
// and writes the ABI + bytecode the website uses to src/launchpad/evm/artifacts.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import solc from 'solc';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const source = fs.readFileSync(path.join(root, 'src/MochePad.sol'), 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'MochePad.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
    evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] } },
  },
};
const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors || []).filter((e) => e.severity === 'error');
for (const e of out.errors || []) console.error(e.formattedMessage);
if (errors.length) process.exit(1);
const c = out.contracts['MochePad.sol'];
const artifacts = {
  compiler: solc.version(),
  MochePad: { abi: c.MochePad.abi, bytecode: '0x' + c.MochePad.evm.bytecode.object },
  MocheToken: { abi: c.MocheToken.abi },
};
fs.mkdirSync(path.join(root, 'out'), { recursive: true });
fs.writeFileSync(path.join(root, 'out/MochePad.json'), JSON.stringify(artifacts, null, 1));
const site = path.join(root, '../src/launchpad/evm/artifacts.json');
fs.mkdirSync(path.dirname(site), { recursive: true });
fs.writeFileSync(site, JSON.stringify(artifacts));
const size = c.MochePad.evm.deployedBytecode.object.length / 2;
console.log(`compiled with ${solc.version()} — MochePad runtime ${size} bytes${size > 24576 ? ' (OVER 24KB LIMIT)' : ''}`);
