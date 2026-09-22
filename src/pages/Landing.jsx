import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import './Landing.css';

const THEME_KEY = 'hsfast-theme';

function initialTheme() {
  // Read synchronously during the first render (not in an effect) so the
  // correct theme paints immediately — no flash of the wrong one while an
  // effect catches up. localStorage can legitimately be empty or throw
  // (private browsing, blocked storage), so this falls back to light rather
  // than breaking the page. Unlike the original static mockup, this never
  // touches document.documentElement: the theme lives entirely on this
  // component's own root element via data-theme-scope, so it can't leak
  // into any other route in the app.
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export default function Landing() {
  const [theme, setTheme] = useState(initialTheme);
  // The page is reachable while signed in (see the "/" route in App.jsx), so the
  // sign-in calls to action become a way back into the app instead.
  const { user } = useAuth();

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable — theme still works for this visit */ }
  };

  return (
    <div className="landing-page" data-theme-scope={theme}>
      <header className="site-header">
        <div className="wordmark">EnduraFAST <span className="tag">by StrataBio</span></div>
        <div className="header-actions">
          <div className="header-links">
            <a className="link-quiet" href="#pipeline">How it works</a>
          </div>
          <button
            className="theme-toggle"
            type="button"
            aria-pressed={theme === 'dark'}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
          </button>
          {user ? (
            <Link className="btn btn-primary" to="/dashboard">Open dashboard</Link>
          ) : (
            <>
              <Link className="btn btn-ghost" to="/login">Sign in</Link>
              <Link className="btn btn-primary" to="/register">Get started</Link>
            </>
          )}
        </div>
      </header>

      <section className="hero">
        <div>
          <h1>The StrataBio protein stability engine predicts protein stability and suggests stabilizing mutations.</h1>
          <p className="sub">
            StrataBio&rsquo;s stability engine predicts &Delta;G directly from amino acid sequences with a
            fine-tuned protein language model, ranks every batch you submit against itself, and
            predicts stabilizing mutations based on large, proprietary wet lab datasets.
          </p>
          <div className="cta-row">
            <Link className="btn btn-primary" to={user ? '/dashboard' : '/register'}>
              {user ? 'Open dashboard' : 'Get started'} &rarr;
            </Link>
            <a className="link-quiet" href="#pipeline">See how a prediction is made</a>
          </div>
        </div>

        <div className="readout">
          <div className="readout-head">
            <span className="eyebrow"><span className="dot" aria-hidden="true"></span>Example output</span>
            <span className="eyebrow">GB1 Y45F, 56 aa</span>
          </div>
          <div className="readout-body">
            <div className="seq mono">MTYKLIL<b>NGKTLKGETTTEAVDAATAEKVFKQYAND</b>NGVDGEWT<b>F</b>DDATKTFTVTE</div>
            <div className="readout-grid">
              <div className="readout-cell">
                <div className="k">&Delta;G, kcal/mol</div>
                <div className="v stable">&minus;8.90</div>
              </div>
              <div className="readout-cell">
                <div className="k">Rank</div>
                <div className="v"><span className="pill pill-rank">1 of 5</span></div>
              </div>
              <div className="readout-cell">
                <div className="k">Confidence</div>
                <div className="v"><span className="pill pill-stable">high</span></div>
              </div>
            </div>
            <div className="readout-foot">
              <span>Illustrative example</span>
              <span>more negative = more stable</span>
            </div>
          </div>
        </div>
      </section>

      <svg className="seq-rule" viewBox="0 0 1120 22" preserveAspectRatio="none" aria-hidden="true">
        <line x1="0" y1="11" x2="1120" y2="11" stroke="var(--line)" strokeWidth="1"></line>
        <g stroke="var(--line-strong)" strokeWidth="1">
          <line x1="0" y1="4" x2="0" y2="18"></line>
          <line x1="140" y1="7" x2="140" y2="15"></line>
          <line x1="280" y1="4" x2="280" y2="18"></line>
          <line x1="420" y1="7" x2="420" y2="15"></line>
          <line x1="560" y1="4" x2="560" y2="18"></line>
          <line x1="700" y1="7" x2="700" y2="15"></line>
          <line x1="840" y1="4" x2="840" y2="18"></line>
          <line x1="980" y1="7" x2="980" y2="15"></line>
          <line x1="1120" y1="4" x2="1120" y2="18"></line>
        </g>
      </svg>

      <section className="metrics">
        <div className="metrics-grid">
          <div className="metric-tile">
            <span className="eyebrow">Mean absolute error</span>
            <div className="figure mono">0.666<small>kcal/mol</small></div>
            <p className="note">Across the full validation set, region-weighted training.</p>
          </div>
          <div className="metric-tile">
            <span className="eyebrow">Spearman &rho;</span>
            <div className="figure mono">0.868</div>
            <p className="note">Rank correlation: the figure the platform is built to optimise.</p>
          </div>
          <div className="metric-tile">
            <span className="eyebrow">Central-band MAE</span>
            <div className="figure mono">0.47<small>kcal/mol</small></div>
            <p className="note">MAE on proteins ranging from &minus;3 to 0 kcal/mol, where 47% of measured variants reside.</p>
          </div>
          <div className="metric-tile">
            <span className="eyebrow">Validation sequences</span>
            <div className="figure mono">40,146</div>
            <p className="note">Held-out sequences the figures above were measured on; none were used in training.</p>
          </div>
        </div>
      </section>

      <section className="problem">
        <div className="problem-grid">
          <p className="pullquote">
            &ldquo;Thermostability prediction accuracy does not always translate to
            stability-improving mutation predictions.&rdquo;
          </p>
          <div className="problem-body">
            <p>
              Most thermostability datasets are broad but shallow, relying on thousands of
              different types of proteins measured at once. They teach a model what separates
              stable and unstable folds. However, they do not teach it to rank-order thousands of
              variants of <strong>your</strong> scaffold, which is the comparison the StrataBio
              stability model was built on.
            </p>
            <p>
              EnduraFAST is built around that distinction. Every batch is ranked, not just scored,
              and ranking accuracy is measured <strong>within a single parent protein</strong>,
              not averaged across unrelated ones, where a real weakness can hide behind a
              good-looking overall number.
            </p>
          </div>
        </div>
      </section>

      <section className="pipeline" id="pipeline">
        <div className="section-head">
          <h2>How a prediction is made</h2>
        </div>
        <div className="pipeline-track">
          <div className="pipe-step">
            <span className="pipe-num">01</span>
            <h3>Sequence in</h3>
            <p>Paste or upload FASTA: one sequence or a batch.</p>
          </div>
          <div className="pipe-step">
            <span className="pipe-num">02</span>
            <h3>Language-model encoding</h3>
            <p>A protein language model, pretrained on evolutionary sequence data, embeds the full chain.</p>
          </div>
          <div className="pipe-step">
            <span className="pipe-num">03</span>
            <h3>Fine-tuning + environment gate</h3>
            <p>Adapters fine-tuned on stability data; a gate conditions on temperature.</p>
          </div>
          <div className="pipe-step">
            <span className="pipe-num">04</span>
            <h3>Ranked &Delta;G output</h3>
            <p>Every sequence in the batch is ordered against the others, not scored in isolation.</p>
          </div>
          <div className="pipe-step">
            <span className="pipe-num">05</span>
            <h3>Range check</h3>
            <p>Anything outside the model&rsquo;s training envelope is flagged before you see it.</p>
          </div>
        </div>
      </section>

      <section className="batch-demo">
        <div className="section-head">
          <span className="eyebrow">What comes back</span>
          <h2>Submit a batch, get a ranked chart, not just a spreadsheet of numbers.</h2>
        </div>
        <div className="batch-card">
          <div className="batch-card-head">
            <h3>Ranked &Delta;G (example batch)</h3>
            <div className="batch-legend">
              <span><span className="sw sw-stable" aria-hidden="true"></span>stable</span>
              <span><span className="sw sw-borderline" aria-hidden="true"></span>borderline</span>
              <span><span className="sw sw-unstable" aria-hidden="true"></span>unstable</span>
            </div>
          </div>

          <div className="batch-rows">
            <div className="batch-row">
              <span className="batch-row-name">GB1 Y45F<span className="batch-row-rank"> &middot; Rank 1</span></span>
              <div className="batch-row-track"><div className="batch-row-zero"></div><div className="batch-row-bar stable" style={{ left: '5.5%', width: '44.5%' }}></div></div>
              <span className="batch-row-value stable">&minus;8.90</span>
            </div>
            <div className="batch-row">
              <span className="batch-row-name">GB1 E19K<span className="batch-row-rank"> &middot; Rank 2</span></span>
              <div className="batch-row-track"><div className="batch-row-zero"></div><div className="batch-row-bar stable" style={{ left: '8.5%', width: '41.5%' }}></div></div>
              <span className="batch-row-value stable">&minus;8.30</span>
            </div>
            <div className="batch-row">
              <span className="batch-row-name">
                fusion construct, 162 aa
                <span className="batch-row-flag"><AlertTriangle style={{ width: 9, height: 9 }} /> beyond trained length</span>
              </span>
              <div className="batch-row-track"><div className="batch-row-zero"></div><div className="batch-row-bar stable flagged" style={{ left: '0.5%', width: '49.5%' }}></div></div>
              <span className="batch-row-value stable">&minus;9.90</span>
            </div>
            <div className="batch-row">
              <span className="batch-row-name">GB1 T2Q<span className="batch-row-rank"> &middot; Rank 3</span></span>
              <div className="batch-row-track"><div className="batch-row-zero"></div><div className="batch-row-bar stable" style={{ left: '11%', width: '39%' }}></div></div>
              <span className="batch-row-value stable">&minus;7.80</span>
            </div>
            <div className="batch-row">
              <span className="batch-row-name">GB1 wild type<span className="batch-row-rank"> &middot; Rank 4</span></span>
              <div className="batch-row-track"><div className="batch-row-zero"></div><div className="batch-row-bar stable" style={{ left: '13.2%', width: '36.8%' }}></div></div>
              <span className="batch-row-value stable">&minus;7.37</span>
            </div>
          </div>

          <div className="batch-axis">
            <span></span>
            <span className="batch-axis-track"><span>&larr; more stable</span><span>&Delta;G (kcal/mol)</span><span>less stable &rarr;</span></span>
            <span></span>
          </div>

          <p className="batch-caption">
            Illustrative example, not live data. <strong>Rank</strong> orders the batch;
            the fusion construct is longer than anything in training, so it&rsquo;s flagged
            even though the number itself looks like a strong candidate.
          </p>
        </div>
      </section>

      <section className="validation">
        <div className="validation-grid">
          <div className="chart-card">
            <div className="chart-cap"><span>Predicted vs. measured (illustrative)</span><span>rank order, not to scale</span></div>
            <svg viewBox="0 0 420 250" role="img" aria-label="Illustrative scatter comparing predicted and measured stability rank for a wild type and three stabilised variants of the same scaffold, showing close agreement">
              <line x1="46" y1="16" x2="46" y2="206" stroke="var(--line-strong)" strokeWidth="1"></line>
              <line x1="46" y1="206" x2="400" y2="206" stroke="var(--line-strong)" strokeWidth="1"></line>
              <line x1="46" y1="206" x2="400" y2="16" stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4"></line>
              <text x="46" y="228" fontFamily="IBM Plex Mono" fontSize="10" fill="var(--ink-faint)">least stable</text>
              <text x="325" y="228" fontFamily="IBM Plex Mono" fontSize="10" fill="var(--ink-faint)">most stable</text>
              <text x="10" y="208" fontFamily="IBM Plex Mono" fontSize="10" fill="var(--ink-faint)" transform="rotate(-90 10 208)">measured</text>
              <text x="46" y="10" fontFamily="IBM Plex Mono" fontSize="10" fill="var(--ink-faint)">predicted &rarr;</text>
              <circle cx="96" cy="180" r="7" fill="none" stroke="var(--accent-fg)" strokeWidth="1.5"></circle>
              <circle cx="96" cy="180" r="3.5" fill="var(--accent-fg)"></circle>
              <text x="108" y="184" fontFamily="IBM Plex Mono" fontSize="10.5" fontWeight="600" fill="var(--ink)">GB1 wild type</text>
              <circle cx="176" cy="138" r="5" fill="var(--accent-fg)"></circle>
              <text x="186" y="142" fontFamily="IBM Plex Mono" fontSize="10.5" fill="var(--ink-muted)">GB1 T2Q</text>
              <circle cx="258" cy="80" r="5" fill="var(--accent-fg)"></circle>
              <text x="268" y="84" fontFamily="IBM Plex Mono" fontSize="10.5" fill="var(--ink-muted)">GB1 E19K</text>
              <circle cx="340" cy="42" r="5" fill="var(--accent-fg)"></circle>
              <text x="298" y="30" fontFamily="IBM Plex Mono" fontSize="10.5" fill="var(--ink-muted)">GB1 Y45F</text>
            </svg>
            <p className="chart-note"><strong>Ringed point</strong> is the reference wild type; the other three are stabilised variants of the same scaffold, plotted here in schematic rank order only.</p>
          </div>
          <div className="validation-body">
            <span className="eyebrow">Designed libraries</span>
            <h2 style={{ marginTop: '12px' }}>Bring your library. Know which variants are worth pursuing.</h2>
            <p>
              Submit a designed enzyme-engineering library and get a ranked prediction for every
              variant, alongside raw predictions from the parent scaffold, so bench effort goes to
              the candidates most likely to pay off.
            </p>
            <p>
              With bench data from a first round, we can make initial predictions on new libraries
              and provide focused subsets of data to inform the next round of designs.
            </p>
          </div>
        </div>

        <div className="cta-band">
          <h2>See your own sequences ranked.</h2>
          <div className="cta-side">
            <Link className="btn btn-primary" to={user ? '/predict' : '/register'}>
              {user ? 'New prediction' : 'Get started'} &rarr;
            </Link>
            {!user && <span className="cta-note">Login required.</span>}
          </div>
        </div>
      </section>

      <footer>
        <div className="fmark">EnduraFAST</div>
        <p className="fine">
          EnduraFAST is a protein and enzyme stability prediction platform built by StrataBio.
          Predictions are a computational estimate for prioritising candidates, not a substitute
          for experimental validation.
        </p>
      </footer>
    </div>
  );
}
