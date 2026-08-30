import { useState } from "react";
import { Link } from "react-router-dom";

const stages = [
  ["install", "12s", "complete"],
  ["build", "1m 04s", "complete"],
  ["test", "48s", "complete"],
  ["sign", "3s", "complete"],
  ["canary", "running", "running"],
  ["promote", "-", "pending"],
] as const;

const logs = [
  ["09:41:02", "install", "pkg-lock.json", "DONE"],
  ["09:41:14", "build", "dist-8f2c1ad.tar.gz", "DONE"],
  ["09:42:18", "test", "coverage-report.xml", "PASS"],
  ["09:43:06", "sign", "signature-8f2c1ad.sig", "DONE"],
] as const;

const customers = ["Kestrel IO", "Northwind Data", "Heliograph", "Parabola Labs", "Tidewater Cloud", "Meridian Stack"];

const NexusLanding = () => {
  const [copied, setCopied] = useState(false);

  const copyCommand = async () => {
    await navigator.clipboard?.writeText("npx nexus init");
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  return (
    <main className="nexus-landing">
      <nav className="nexus-nav">
        <div className="nexus-container nexus-nav-inner">
          <Link to="/" className="nexus-brand">
            <span className="nexus-monogram">N</span>
            <span className="nexus-wordmark">nexus</span>
          </Link>
          <div className="nexus-nav-links">
            <a href="#product">Product</a><a href="#pipelines">Pipelines</a><a href="#docs">Docs</a><a href="#pricing">Pricing</a><a href="#changelog">Changelog</a>
          </div>
          <div className="nexus-nav-actions">
            <span className="nexus-version">v<strong>2.4.0</strong></span>
            <Link to="/login" className="nexus-signin">Sign in</Link>
            <Link to="/register" className="nexus-button">Start building</Link>
          </div>
        </div>
      </nav>

      <section className="nexus-container nexus-hero" id="product">
        <div>
          <div className="nexus-eyebrow"><i />SPEC / 001 - CONTINUOUS DELIVERY</div>
          <h1>Ship every commit with a receipt.</h1>
        </div>
        <div className="nexus-hero-side">
          <div className="nexus-rule" />
          <p className="nexus-subtitle">Nexus turns every commit into a verified, observable deployment. Build faster without losing the evidence your team depends on.</p>
          <div className="nexus-cta">
            <Link to="/register" className="nexus-button">Start building</Link>
            <div className="nexus-command"><span>$ npx nexus init</span><button type="button" aria-label="Copy command" onClick={copyCommand}><span className="material-symbols-outlined">{copied ? "check" : "content_copy"}</span></button></div>
          </div>
          <div className="nexus-note">No card. 500 build-minutes free.</div>
        </div>
      </section>

      <section className="nexus-container nexus-mockup-wrap" id="pipelines" aria-label="Pipeline deployment receipt">
        <div className="nexus-dimension"><span>1440</span></div>
        <div className="nexus-mockup">
          <div className="nexus-corner" /><div className="nexus-corner second" />
          <div className="nexus-titlebar"><span className="nexus-squares"><i /><i /><i /></span><strong>nexus - deploy/api-gateway</strong><span>main@8f2c1ad</span></div>
          <div className="nexus-mockup-body">
            <aside className="nexus-rail">
              <div>{stages.map(([name, duration, state]) => <div className={`nexus-stage ${state}`} key={name}><i className="nexus-glyph" /><span>{name}</span><time>{duration}</time></div>)}</div>
              <div className="nexus-rail-footer"><span className="nexus-label">Artifacts</span><strong>4 signed / 0 unsigned</strong></div>
            </aside>
            <div className="nexus-mainpane">
              <div className="nexus-timeline-wrap"><div className="nexus-timeline">{stages.map(([name, duration, state]) => <div className={`nexus-point ${state}`} key={name}><b /><span>{duration}</span></div>)}</div></div>
              <div className="nexus-log">
                <div className="nexus-log-row"><span>Timestamp</span><span>Stage</span><span>Artifact</span><span>Status</span></div>
                {logs.map(([timestamp, stage, artifact, status]) => <div className="nexus-log-row" key={artifact}><span>{timestamp}</span><span>{stage}</span><span>{artifact}</span><span className={`nexus-token ${status === "PASS" ? "pass" : ""}`}>{status}</span></div>)}
              </div>
              <div className="nexus-receipt">
                <dl><dt>Receipt no.</dt><dd>RC-8f2c1ad-0417</dd></dl><dl><dt>Checksum</dt><dd>sha256:9d41c0e2</dd></dl><dl><dt>Signed by</dt><dd>nexus-ci / cosign</dd></dl><span className="nexus-stamp">Signed</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="nexus-container nexus-stats" aria-label="Nexus operating statistics">
        <div className="nexus-stat"><strong>99.98%</strong><span className="nexus-stat-caption">Pipeline uptime</span></div>
        <div className="nexus-stat"><strong>2m 14s</strong><span className="nexus-stat-caption">Median pipeline run</span></div>
        <div className="nexus-stat"><strong>12k</strong><span className="nexus-stat-caption">Deploys / day</span></div>
      </section>

      <footer className="nexus-ticker" id="changelog"><div className="nexus-ticker-track"><div className="nexus-ticker-list">{customers.map((customer) => <span key={customer}>{customer}<i /></span>)}</div><div className="nexus-ticker-list" aria-hidden="true">{customers.map((customer) => <span key={customer}>{customer}<i /></span>)}</div></div></footer>
    </main>
  );
};

export default NexusLanding;
