import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ArrowRight, ArrowLeft, Search, Rocket, Wallet, ShieldCheck, Check, ExternalLink, LockKeyhole, CircleHelp, ChevronRight, Upload, Download, ChartNoAxesCombined } from 'lucide-react';
import { CORE_ASSETS, HYPE, type Asset } from '../lib/constants';
import { OPENING_MARKET_CAP_USD, GRADUATION_MARKET_CAP_USD } from '../lib/launch-policy';
import { launchSchema, safeUrl, fromAtomic } from '../lib/validation';
import { readApiJson } from '../lib/http';
import { curveFor, launch, mintInfo } from './chain';
import { getLaunchPricing, type LaunchPricing } from './pricing';
import { useAutomaticUpload } from './useAutomaticUpload';
import { Address, AssetIcon, Field, Notice, PageTitle, format, go, message, safeHref, type ActionProps } from './ui';

const STEPS = ['Identity', 'Pair', 'Curve & fees', 'Review'];

export function LaunchStudio({ assets, session, connect, action, busy, setStatus }: ActionProps & { assets: Asset[] }) {
  const initialPair = new URLSearchParams(location.hash.split('?')[1]).get('pair') || HYPE;
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [uri, setUri] = useState('');
  const [pair, setPair] = useState(initialPair);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [fee, setFee] = useState(200);
  const [dynamic, setDynamic] = useState(false);
  const [shield, setShield] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');
  const [decimals, setDecimals] = useState<number | null>(null);
  const [uploadEnabled, setUploadEnabled] = useState(false);
  const [localImage, setLocalImage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [prepared, setPrepared] = useState(false);
  const [pricing, setPricing] = useState<LaunchPricing | null>(null);
  const [priceError, setPriceError] = useState('');

  const asset = assets.find((a) => a.mint === pair) || CORE_ASSETS[0];
  const initial = pricing?.initialCap ?? 0, graduation = pricing?.graduationCap ?? 0;
  const input = { name, symbol, uri, initialCap: Number(initial), graduationCap: Number(graduation), feeBps: fee, dynamic, shield };

  useEffect(() => {
    let active = true; setPricing(null); setPriceError('');
    async function refreshPrice() {
      try { const p = await getLaunchPricing(pair); if (active) { setPricing(p); setPriceError(''); } }
      catch (e) { if (active) { setPricing(null); setPriceError(message(e)); } }
    }
    refreshPrice();
    const t = setInterval(refreshPrice, 30000);
    return () => { active = false; clearInterval(t); };
  }, [pair]);
  useEffect(() => { fetch('/api/status').then((r) => r.json()).then((d) => setUploadEnabled(!!d.uploadsEnabled)).catch(() => {}); }, []);
  useEffect(() => { setDecimals(null); mintInfo(pair).then((i) => setDecimals(i.decimals)).catch(() => {}); }, [pair]);
  useEffect(() => () => { if (localImage) URL.revokeObjectURL(localImage); }, [localImage]);

  let threshold = '—';
  try { if (decimals !== null && launchSchema.safeParse(input).success) threshold = fromAtomic(curveFor(input, decimals).migrationQuoteThreshold, decimals); } catch {}

  function downloadMetadata() {
    const content = { name, symbol, description, image: imageUrl, external_url: website, properties: { category: 'image', launchpad: 'usemoche', files: imageUrl ? [{ uri: imageUrl, type: 'image/png' }] : [] } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `${symbol || 'token'}-metadata.json`; a.click(); URL.revokeObjectURL(url);
  }

  async function verifyMetadata() {
    setError(''); setPrepared(false);
    try {
      const r = await fetch(safeUrl(uri), { signal: AbortSignal.timeout(12000) });
      if (!r.ok) throw new Error('Metadata URL did not return a valid response.');
      const data = await r.json();
      if (data.name !== name || data.symbol !== symbol) throw new Error('Metadata name and symbol must match your token.');
      if (!data.image) throw new Error('Metadata must include an image URL.');
      setImageUrl(safeUrl(data.image)); setPrepared(true);
    } catch (e) { setError('Metadata check: ' + message(e)); }
  }

  const connectedWallet = useRef(session); connectedWallet.current = session;
  async function upload(selectedFile: File) {
    cancelUpload(); setError('');
    if (!name.trim() || new TextEncoder().encode(name.trim()).length > 32 || !/^[A-Z0-9]{2,10}$/.test(symbol)) { setError('Enter a token name (up to 32 bytes) and a 2–10 character ticker first.'); return; }
    if (website) { try { if (new URL(website).protocol !== 'https:') throw new Error(); } catch { setError('Your website must be a valid HTTPS URL.'); return; } }
    if (!session) { connect(); return; }
    let uploadedUri: string | undefined;
    await action(async () => {
      setStatus('Uploading artwork and creating token metadata…');
      const data = await selectedFile.arrayBuffer();
      if (connectedWallet.current?.address !== session.address) throw new Error('Connect your wallet again before uploading.');
      const b64 = (a: Uint8Array) => btoa(Array.from(a, (x) => String.fromCharCode(x)).join(''));
      const response = await fetch('/api/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(55000), body: JSON.stringify({ address: session.address, image: b64(new Uint8Array(data)), type: selectedFile.type, name: name.trim(), symbol, description, website }) });
      const d = await readApiJson(response, 'Image upload');
      if (typeof d.uri !== 'string' || typeof d.image !== 'string') throw new Error('The upload service returned an incomplete result. Please retry.');
      uploadedUri = d.uri; setUri(d.uri); setImageUrl(d.image); setName(name.trim()); setPrepared(true);
      setStatus('Image uploaded and metadata created. You can continue.');
    });
    return uploadedUri;
  }
  const identityReady = !!name.trim() && new TextEncoder().encode(name.trim()).length <= 32 && /^[A-Z0-9]{2,10}$/.test(symbol) && (!website || (() => { try { return new URL(website).protocol === 'https:'; } catch { return false; } })());
  const { uploadQueued, queueUpload, cancelUpload } = useAutomaticUpload({ identity: JSON.stringify([name, symbol, description, website]), ready: identityReady, connected: !!session, busy, upload, connect });

  async function next() {
    setError('');
    try {
      if (step === 0) {
        if (!name.trim() || !/^[A-Z0-9]{2,10}$/.test(symbol)) throw new Error('Enter a token name and a 2–10 character ticker.');
        if (file && uploadEnabled && !prepared) { if (!session) { queueUpload(file); return; } if (!(await upload(file))) return; setStep(1); return; }
        if (!uri) throw new Error(uploadEnabled ? 'Choose a token image. Its metadata is created automatically.' : 'Provide a hosted metadata JSON URI. You can download a template below.');
        safeUrl(uri);
      }
      if (step === 1) { await mintInfo(asset.mint); if (asset.halted) throw new Error('The issuer has halted this asset.'); }
      if (step === 2) {
        if (!pricing || Date.now() - pricing.asOf > 120000) throw new Error('Wait for a current USD price for the pair before continuing.');
        const p = launchSchema.parse(input);
        if (decimals === null) throw new Error('Pair token verification is still loading.');
        curveFor(p, decimals);
      }
      setStep(Math.min(3, step + 1));
    } catch (e) { setError(message(e)); }
  }

  const list = assets.filter((a) => (category === 'all' || a.category === category) && `${a.name} ${a.symbol}`.toLowerCase().includes(search.toLowerCase())).slice(0, 40);

  return (
    <>
      <PageTitle label="Launch studio" title="Launch your token." copy="Create an immutable token and a real market in one transaction. You choose the identity and pair; Meteora powers the liquidity." />
      <div className="lp-studio">
        <fieldset className="lp-panel lp-studio__main" disabled={busy}>
          <ol className="lp-stepper" role="list">
            {STEPS.map((s, i) => (
              <li key={s}>
                <button className={step === i ? 'is-current' : step > i ? 'is-done' : ''} onClick={() => { if (i < step) setStep(i); }} disabled={i > step || busy} aria-current={step === i ? 'step' : undefined}>
                  <span>{step > i ? <Check size={13} /> : i + 1}</span><em>{s}</em>
                </button>
              </li>
            ))}
          </ol>
          {error && <Notice tone="warn">{error}</Notice>}

          {step === 0 && (
            <div className="lp-form">
              <h2>Token identity</h2>
              <p className="lp-muted">1 billion tokens · 6 decimals · no mint or freeze authority.</p>
              <div className="lp-fields2">
                <Field label="Token name"><input maxLength={32} value={name} onChange={(e) => { setName(e.target.value); setPrepared(false); }} placeholder="Moon Mochi" /></Field>
                <Field label="Ticker"><input maxLength={10} value={symbol} onChange={(e) => { setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); setPrepared(false); }} placeholder="MOCHI" /></Field>
              </div>
              <Field label="Description"><textarea maxLength={1000} value={description} onChange={(e) => { setDescription(e.target.value); setPrepared(false); }} placeholder="What is it about?" rows={3} /></Field>
              <Field label="Website (optional)"><input type="url" value={website} onChange={(e) => { setWebsite(e.target.value); setPrepared(false); }} placeholder="https://" /></Field>
              {uploadEnabled && (
                <div className="lp-upload">
                  <label className="lp-upload__box">
                    <Upload size={22} />
                    <span><strong>Token image</strong><small>PNG, JPG or WebP · up to 2 MB</small></span>
                    <input type="file" aria-label="Token image" disabled={!session || busy} accept="image/png,image/jpeg,image/webp" onChange={(e) => {
                      if (!session) { e.target.value = ''; connect(); return; }
                      const f = e.target.files?.[0]; if (!f) return;
                      if (f.size > 2 * 1024 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(f.type)) { setError('Choose a PNG, JPG or WebP image under 2 MB.'); e.target.value = ''; return; }
                      setError(''); setFile(f); setPrepared(false); setUri('');
                      if (localImage) URL.revokeObjectURL(localImage);
                      setLocalImage(URL.createObjectURL(f)); queueUpload(f);
                    }} />
                  </label>
                  <button className="lp-btn lp-btn--secondary lp-btn--sm" disabled={busy || (!!session && (!file || !identityReady || prepared))} onClick={() => { if (!session) connect(); else if (file) queueUpload(file); }}>
                    {busy ? 'Uploading…' : prepared ? 'Uploaded' : !session ? 'Connect to upload' : uploadQueued ? 'Upload queued…' : 'Retry upload'}{prepared ? <Check size={15} /> : <ArrowUpRight size={15} />}
                  </button>
                  <p className="lp-help">{!session ? 'Connect your wallet to upload an image. No signature is needed.' : uploadQueued && !identityReady ? 'Image selected. Finish the name and ticker and it uploads automatically.' : 'We store the image and token metadata on IPFS for you.'}</p>
                  {prepared && file && <p className="lp-ok"><Check size={15} />Saved to IPFS · ready <a href={safeHref(uri)} target="_blank" rel="noreferrer">View metadata <ExternalLink size={13} /></a></p>}
                </div>
              )}
              <Field label={uploadEnabled ? 'Metadata URI (filled after upload)' : 'Hosted metadata JSON URI'} hint="Must contain the same name and symbol, and an image URL. Permanent after launch.">
                <input value={uri} onChange={(e) => { setUri(e.target.value); setPrepared(false); }} maxLength={100} placeholder={uploadEnabled ? 'Filled automatically after upload' : 'ipfs://… or https://…/metadata.json'} />
              </Field>
              <div className="lp-row">
                <button className="lp-btn lp-btn--ghost lp-btn--sm" onClick={downloadMetadata}><Download size={15} />Metadata template</button>
                <button className="lp-btn lp-btn--ghost lp-btn--sm" onClick={verifyMetadata}><ShieldCheck size={15} />{prepared ? 'Metadata verified' : 'Verify metadata'}</button>
              </div>
              {!uploadEnabled && <p className="lp-help">Image uploads aren’t switched on for this site yet. Host your metadata JSON on IPFS or HTTPS and paste its URI.</p>}
            </div>
          )}

          {step === 1 && (
            <div className="lp-form">
              <h2>Choose your pair</h2>
              <p className="lp-muted">Traders buy your token with this asset, and curve fees accrue in it.</p>
              <label className="lp-search lp-search--wide"><Search size={16} /><input aria-label="Search pairs" placeholder="Search HYPE, SOL, USDC or stocks" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
              <div className="lp-seg" role="group" aria-label="Pair type">
                {[['all', 'All'], ['crypto', 'HYPE & crypto'], ['stock', 'Tokenized stocks']].map(([c, l]) => (
                  <button key={c} aria-pressed={c === category} onClick={() => setCategory(c)}>{l}</button>
                ))}
              </div>
              <div className="lp-picklist">
                {list.map((a) => (
                  <button className={`${pair === a.mint ? 'is-on' : ''} ${a.featured ? 'is-hype' : ''}`} key={a.mint} disabled={a.halted} onClick={() => setPair(a.mint)} aria-pressed={pair === a.mint}>
                    <AssetIcon asset={a} />
                    <span><strong>{a.symbol}</strong><small>{a.name}</small></span>
                    <span className={`lp-pill ${a.featured ? 'lp-pill--hype' : ''}`}>{a.halted ? 'Halted' : a.featured ? 'Hyperliquid' : a.category === 'stock' ? 'xStock' : 'Crypto'}</span>
                    {pair === a.mint ? <Check size={18} /> : <ChevronRight size={16} />}
                  </button>
                ))}
              </div>
              {asset.category === 'stock' && <Notice>Tokenized stock restrictions apply. Amounts use raw token units, before the issuer’s display multiplier. <a href="https://assets.backed.fi/legal-documentation" target="_blank" rel="noreferrer">Issuer terms</a></Notice>}
              {asset.featured === 'hyperliquid' && <Notice>HYPE here is the Wormhole-bridged token on Solana (<Address value={HYPE} />). It’s checked on-chain before launch.</Notice>}
            </div>
          )}

          {step === 2 && (
            <div className="lp-form">
              <h2>Curve &amp; fees</h2>
              <p className="lp-muted">Every launch opens at ${OPENING_MARKET_CAP_USD.toLocaleString()} and graduates at ${GRADUATION_MARKET_CAP_USD.toLocaleString()}.</p>
              <div className="lp-caps">
                <div><span>Opening market cap</span><strong>${OPENING_MARKET_CAP_USD.toLocaleString()}</strong></div>
                <div><span>Graduation market cap</span><strong>${GRADUATION_MARKET_CAP_USD.toLocaleString()}</strong></div>
              </div>
              {priceError ? <Notice tone="warn">{priceError} Retrying automatically.</Notice>
                : <p className="lp-help">{pricing ? <>Right now that’s {format(initial)} → {format(graduation)} {asset.symbol}. Re-checked at launch.</> : `Fetching the ${asset.symbol} USD price…`}</p>}
              <div className="lp-field">
                <span className="lp-field__label">Trading fee</span>
                <div className="lp-choices">
                  {[100, 200, 300].map((f) => (
                    <button key={f} aria-pressed={fee === f} onClick={() => setFee(f)}><strong>{f / 100}%</strong><small>{f === 100 ? 'Lower friction' : f === 200 ? 'Balanced' : 'Higher fee'}</small></button>
                  ))}
                </div>
              </div>
              <label className="lp-switch"><ShieldCheck size={20} /><span><strong>Launch fee protection</strong><small>Starts at 10% and falls to your fee over 5 minutes, to slow snipers.</small></span><input type="checkbox" checked={shield} onChange={(e) => setShield(e.target.checked)} /></label>
              <label className="lp-switch"><ChartNoAxesCombined size={20} /><span><strong>Dynamic fee</strong><small>Meteora can add a volatility-based fee on top.</small></span><input type="checkbox" checked={dynamic} onChange={(e) => setDynamic(e.target.checked)} /></label>
              <div className="lp-info"><LockKeyhole size={19} /><p><strong>Liquidity stays put.</strong> On graduation, 100% of the migrated liquidity is locked forever, split 50/50 between creator and platform. Both can claim LP fees.</p></div>
            </div>
          )}

          {step === 3 && (
            <div className="lp-form">
              <h2>Review &amp; launch</h2>
              <p className="lp-muted">These settings are permanent. Token, curve and market are created together in one transaction.</p>
              <dl className="lp-dl">
                <div><dt>Token</dt><dd>{name} · ${symbol}</dd></div>
                <div><dt>Supply</dt><dd>1,000,000,000</dd></div>
                <div><dt>Opening / graduation</dt><dd>${OPENING_MARKET_CAP_USD.toLocaleString()} / ${GRADUATION_MARKET_CAP_USD.toLocaleString()}</dd></div>
                <div><dt>Mint &amp; freeze authority</dt><dd>Revoked</dd></div>
                <div><dt>Pair</dt><dd>{asset.symbol} <Address value={asset.mint} /></dd></div>
                <div><dt>Trading fee</dt><dd>{shield ? '10% → ' : ''}{fee / 100}%{dynamic ? ' + dynamic' : ''}</dd></div>
                <div><dt>Creator / platform</dt><dd>50% / 50%</dd></div>
                <div><dt>LP lock</dt><dd>100%, permanent</dd></div>
                <div><dt>Metadata</dt><dd><a href={safeHref(uri)} target="_blank" rel="noreferrer">View JSON <ExternalLink size={13} /></a></dd></div>
              </dl>
              <div className="lp-info"><CircleHelp size={19} /><p>Network fees and account rent are paid in SOL. The launch either fully succeeds or fully fails; a failed transaction can still cost a network fee.</p></div>
              <label className="lp-check"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /><span>I’ve reviewed the settings, metadata, fees and permanent liquidity lock.{asset.category === 'stock' ? ' I’m eligible under the stock issuer’s terms.' : ''}</span></label>
              {!prepared && <button className="lp-btn lp-btn--secondary" onClick={verifyMetadata}>Verify metadata first <ShieldCheck size={16} /></button>}
            </div>
          )}

          <div className="lp-studio__foot">
            <button className="lp-btn lp-btn--ghost" disabled={step === 0 || busy} onClick={() => setStep((s) => s - 1)}><ArrowLeft size={15} />Back</button>
            {step < 3 ? <button className="lp-btn lp-btn--primary" onClick={next} disabled={busy}>Continue <ArrowRight size={16} /></button>
              : !session ? <button className="lp-btn lp-btn--primary" onClick={connect}>Connect wallet <Wallet size={16} /></button>
              : <button className="lp-btn lp-btn--primary" disabled={!agreed || !prepared || busy || !pricing} onClick={() => action(async () => { const r = await launch(input, asset, session, setStatus); go('market/' + r.pool); return r.signature; })}>{busy ? 'Working…' : 'Launch on mainnet'}<Rocket size={16} /></button>}
          </div>
        </fieldset>

        <aside className="lp-panel lp-summary" aria-label="Launch summary">
          <div className="lp-summary__art">{localImage || imageUrl ? <img src={localImage || safeHref(imageUrl)} alt="Token artwork" /> : <img src="/images/moche-avatar-256.webp" alt="" />}</div>
          <h3>{name || 'Your token'}</h3>
          <span className="lp-muted">${symbol || 'TICKER'} / {asset.symbol}</span>
          <svg className="lp-curve" viewBox="0 0 300 120" role="img" aria-label="Illustrative bonding curve">
            <defs><linearGradient id="lpcurve" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#2455f5" stopOpacity=".25" /><stop offset="1" stopColor="#2455f5" stopOpacity="0" /></linearGradient></defs>
            <path d="M12 100 Q130 99 175 62 T288 12 L288 116 L12 116Z" fill="url(#lpcurve)" />
            <path d="M12 100 Q130 99 175 62 T288 12" fill="none" stroke="#2455f5" strokeWidth="2.5" />
            <circle cx="288" cy="12" r="4.5" fill="#2455f5" />
          </svg>
          <small className="lp-note">Illustrative curve · not a price forecast</small>
          <dl className="lp-dl lp-dl--tight">
            <div><dt>Opening cap</dt><dd>${OPENING_MARKET_CAP_USD.toLocaleString()}</dd></div>
            <div><dt>Graduation</dt><dd>${GRADUATION_MARKET_CAP_USD.toLocaleString()}</dd></div>
            <div><dt>Reserve target</dt><dd>{threshold === '—' ? threshold : format(Number(threshold))} {asset.symbol}</dd></div>
            <div><dt>Fee</dt><dd>{fee / 100}%{dynamic ? ' + dynamic' : ''}</dd></div>
          </dl>
          <p className="lp-help"><ShieldCheck size={14} /> Your wallet signs every transaction.</p>
        </aside>
      </div>
    </>
  );
}
