import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sun, Moon, AlertTriangle } from 'lucide-react';
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

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable — theme still works for this visit */ }
  };

  return (
    <div className="landing-page" data-theme-scope={theme}>
      <header className="site-header">
        <div className="wordmark">hsFAST <span className="tag">Research Platform</span></div>
        <div className="header-actions">
          <div className="header-links">
            <a className="link-quiet" href="#pipeline">How it works</a>
            <a className="link-quiet" href="#rigor">Rigor</a>
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
          <Link className="btn btn-ghost" to="/login">Sign in</Link>
          <Link className="btn btn-primary" to="/register">Get started</Link>
        </div>
      </header>

      <section className="hero">
        <div>
          <h1>Which variant is more stable? hsFAST tells you &mdash; and tells you when it isn&rsquo;t sure.</h1>
          <p className="sub">
            hsFAST predicts &Delta;G stability straight from an amino acid sequence with a fine-tuned
            protein language model, ranks every batch you submit against itself, and flags any
            call that falls outside what the model actually saw in training &mdash; instead of handing
            back a confident-looking number regardless.
          </p>
          <div className="cta-row">
            <Link className="btn btn-primary" to="/register">Get started &rarr;</Link>
            <a className="link-quiet" href="#pipeline">See how a prediction is made</a>
          </div>
        </div>

        <div className="readout">
          <div className="readout-head">
            <span className="eyebrow"><span className="dot" aria-hidden="true"></span>Example output</span>
            <span className="eyebrow">GB1, 56 aa</span>
          </div>
          <div className="readout-body">
            <div className="seq mono">MTYKLIL<b>NGKTLKGETTTEAVDAATAEKVFKQYAND</b>NGVDGEWTYDDATKTFTVTE</div>
            <div className="readout-grid">
              <div className="readout-cell">
                <div className="k">&Delta;G, kcal/mol</div>
                <div className="v stable">&minus;6.32</div>
              </div>
              <div className="readout-cell">
                <div className="k">Rank</div>
                <div className="v"><span className="pill pill-rank">1 of 4</span></div>
              </div>
              <div className="readout-cell">
                <div className="k">Range check</div>
                <div className="v"><span className="pill pill-stable">in range</span></div>
              </div>
            </div>
            <div className="readout-foot">
              <span>model: esm2_t30_150M_lora_gated</span>
              <span>literature ~5&ndash;6 kcal/mol</span>
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
            <div className="figure mono">0.687<small>kcal/mol</small></div>
            <p className="note">Across the full validation set, region-weighted training.</p>
          </div>
          <div className="metric-tile">
            <span className="eyebrow">Spearman &rho;</span>
            <div className="figure mono">0.861</div>
            <p className="note">Rank correlation &mdash; the figure the platform is built to optimise.</p>
          </div>
          <div className="metric-tile">
            <span className="eyebrow">Central-band MAE</span>
            <div className="figure mono">0.48<small>kcal/mol</small></div>
            <p className="note">Where most engineered variants actually sit.</p>
          </div>
          <div className="metric-tile">
            <span className="eyebrow">Validation sequences</span>
            <div className="figure mono">40,146</div>
            <p className="note">Designed mini-proteins, 40&ndash;80 residues.</p>
          </div>
        </div>
      </section>

      <section className="problem">
        <div className="problem-grid">
          <p className="pullquote">
            &ldquo;A model can rank two unrelated proteins well and still be unable to tell you
            which of two point mutants of your enzyme is the better one.&rdquo;
          </p>
          <div className="problem-body">
            <p>
              Most public thermostability corpora are broad and shallow &mdash; thousands of
              <em> different</em> proteins, each measured once. They teach a model what separates a
              stable fold from an unstable one in general. They don&rsquo;t teach it to order twenty
              variants of <strong>your</strong> scaffold, which is the comparison your program
              actually runs on.
            </p>
            <p>
              hsFAST is built around that distinction. Every batch is ranked, not just scored,
              and once you have bench data, the platform measures ranking accuracy
              <strong> within a single parent protein</strong> &mdash; not averaged across a pile of
              unrelated ones, where a real weakness can hide behind a good-looking overall number.
            </p>
          </div>
        </div>
      </section>

      <section className="pipeline" id="pipeline">
        <div className="section-head">
          <span className="eyebrow">How a prediction is made</span>
          <h2>Sequence in, ranked &Delta;G out &mdash; five steps, every time.</h2>
        </div>
        <div className="pipeline-track">
          <div className="pipe-step">
            <span className="pipe-num">01</span>
            <h3>Sequence in</h3>
            <p>Paste or upload FASTA &mdash; one sequence or a batch.</p>
          </div>
          <div className="pipe-step">
            <span className="pipe-num">02</span>
            <h3>Language-model encoding</h3>
            <p>ESM2-150M, pretrained on evolutionary sequence data, embeds the full chain.</p>
          </div>
          <div className="pipe-step">
            <span className="pipe-num">03</span>
            <h3>LoRA + environment gate</h3>
            <p>Adapters fine-tuned on stability data; a gate conditions on temperature and pH.</p>
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
          <h2>Submit a batch, get a ranked chart &mdash; not just a spreadsheet of numbers.</h2>
        </div>
        <div className="batch-card">
          <div className="batch-card-head">
            <h3>Ranked &Delta;G &mdash; example batch</h3>
            <div className="batch-legend">
              <span><span className="sw sw-stable" aria-hidden="true"></span>stable</span>
              <span><span className="sw sw-borderline" aria-hidden="true"></span>borderline</span>
              <span><span className="sw sw-unstable" aria-hidden="true"></span>unstable</span>
            </div>
          </div>

          <div className="batch-rows">
            <div className="batch-row">
              <span className="batch-row-name">GB1 wild type<span className="batch-row-rank"> &middot; Rank 1</span></span>
              <div className="batch-row-track"><div className="batch-row-zero"></div><div className="batch-row-bar stable" style={{ left: '18.4%', width: '31.6%' }}></div></div>
              <span className="batch-row-value stable">&minus;6.32</span>
            </div>
            <div className="batch-row">
              <span className="batch-row-name">designed variant<span className="batch-row-rank"> &middot; Rank 2</span></span>
              <div className="batch-row-track"><div className="batch-row-zero"></div><div className="batch-row-bar stable" style={{ left: '33%', width: '17%' }}></div></div>
              <span className="batch-row-value stable">&minus;3.40</span>
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
              <span className="batch-row-name">GB1 L5D<span className="batch-row-rank"> &middot; Rank 4</span></span>
              <div className="batch-row-track"><div className="batch-row-zero"></div><div className="batch-row-bar borderline" style={{ left: '46%', width: '4%' }}></div></div>
              <span className="batch-row-value borderline">&minus;0.80</span>
            </div>
            <div className="batch-row">
              <span className="batch-row-name">GB1 W43D<span className="batch-row-rank"> &middot; Rank 5</span></span>
              <div className="batch-row-track"><div className="batch-row-zero"></div><div className="batch-row-bar unstable" style={{ left: '50%', width: '13%' }}></div></div>
              <span className="batch-row-value unstable">+2.60</span>
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
            even though the number itself looks unremarkable &mdash; exactly the kind of call
            a plain table makes easy to miss and a chart makes hard to.
          </p>
        </div>
      </section>

      <section className="rigor" id="rigor">
        <div className="section-head">
          <span className="eyebrow">What the platform won&rsquo;t hide from you</span>
          <h2>Confidence you can check, not confidence you have to take on faith.</h2>
        </div>
        <div className="rigor-list">
          <div className="rigor-item">
            <div className="term">RANK<br />OVER RAW NUMBER</div>
            <div className="desc"><p>Rank is the primary output, in the API and in every view. <span>The absolute &Delta;G is shown too, but it&rsquo;s the number more likely to shift as the model improves &mdash; the order has held far more consistently across model updates.</span></p></div>
          </div>
          <div className="rigor-item">
            <div className="term"><em>OUT-OF-RANGE</em> FLAGGING</div>
            <div className="desc"><p>A prediction outside the labels the model was trained on is marked <em>extrapolated</em>, inline, at the moment you see it. <span>Not buried in documentation you have to go find.</span></p></div>
          </div>
          <div className="rigor-item">
            <div className="term">MODEL<br />PROVENANCE</div>
            <div className="desc"><p>Every result records the exact model version that produced it. <span>Comparing results from two different checkpoints is flagged &mdash; their numbers were never on the same scale to begin with.</span></p></div>
          </div>
          <div className="rigor-item">
            <div className="term">HEURISTIC<br />VS. LEARNED</div>
            <div className="desc"><p>Mutation suggestions that come from a rule rather than the trained model are labelled as such. <span>Useful for exploring positions; not presented as a model prediction.</span></p></div>
          </div>
        </div>
      </section>

      <section className="validation">
        <div className="validation-grid">
          <div className="chart-card">
            <div className="chart-cap"><span>Predicted vs. measured &mdash; illustrative</span><span>rank order, not to scale</span></div>
            <svg viewBox="0 0 420 250" role="img" aria-label="Illustrative scatter comparing predicted and measured stability rank for four example variants, showing close agreement">
              <line x1="46" y1="16" x2="46" y2="206" stroke="var(--line-strong)" strokeWidth="1"></line>
              <line x1="46" y1="206" x2="400" y2="206" stroke="var(--line-strong)" strokeWidth="1"></line>
              <line x1="46" y1="206" x2="400" y2="16" stroke="var(--line)" strokeWidth="1" strokeDasharray="3 4"></line>
              <text x="46" y="228" fontFamily="IBM Plex Mono" fontSize="10" fill="var(--ink-faint)">least stable</text>
              <text x="325" y="228" fontFamily="IBM Plex Mono" fontSize="10" fill="var(--ink-faint)">most stable</text>
              <text x="10" y="208" fontFamily="IBM Plex Mono" fontSize="10" fill="var(--ink-faint)" transform="rotate(-90 10 208)">measured</text>
              <text x="46" y="10" fontFamily="IBM Plex Mono" fontSize="10" fill="var(--ink-faint)">predicted &rarr;</text>
              <circle cx="96" cy="180" r="5" fill="var(--accent-fg)"></circle>
              <text x="106" y="184" fontFamily="IBM Plex Mono" fontSize="10.5" fill="var(--ink-muted)">GB1 W43D</text>
              <circle cx="176" cy="138" r="5" fill="var(--accent-fg)"></circle>
              <text x="186" y="142" fontFamily="IBM Plex Mono" fontSize="10.5" fill="var(--ink-muted)">GB1 L5D</text>
              <circle cx="258" cy="80" r="5" fill="var(--accent-fg)"></circle>
              <text x="268" y="84" fontFamily="IBM Plex Mono" fontSize="10.5" fill="var(--ink-muted)">designed variant</text>
              <circle cx="340" cy="42" r="7" fill="none" stroke="var(--accent-fg)" strokeWidth="1.5"></circle>
              <circle cx="340" cy="42" r="3.5" fill="var(--accent-fg)"></circle>
              <text x="298" y="30" fontFamily="IBM Plex Mono" fontSize="10.5" fontWeight="600" fill="var(--ink)">GB1 wild type</text>
            </svg>
            <p className="chart-note"><strong>Ringed point</strong> is the reference wild type; the other three are variants of the same scaffold, plotted here in schematic rank order only.</p>
          </div>
          <div className="validation-body">
            <span className="eyebrow">Predicted vs. Measured</span>
            <h2 style={{ marginTop: '12px' }}>Bring your own bench data. See exactly where the ranking held.</h2>
            <p>
              Once you log an experiment, the platform pairs every variant&rsquo;s prediction with its
              measured result automatically &mdash; apparent Tm, half-life, or fold change &mdash; and
              reports Spearman rank correlation, with a significance check appropriate to a small
              first panel rather than one built for a dataset ten times the size.
            </p>
            <p>
              The number that matters most sits inside that view: ranking accuracy computed
              <strong> within one parent scaffold</strong>, alongside the pooled figure across every
              protein you&rsquo;ve tested. They can tell different stories, and the platform shows both.
            </p>
          </div>
        </div>

        <div className="cta-band">
          <h2>See your own sequences ranked in the next five minutes.</h2>
          <div className="cta-side">
            <Link className="btn btn-primary" to="/register">Get started &rarr;</Link>
            <span className="cta-note">Login required &mdash; ask your team lead for access.</span>
          </div>
        </div>
      </section>

      <footer>
        <div className="fmark">hsFAST</div>
        <p className="fine">
          hsFAST is a research platform for protein and enzyme stability prediction. Predictions
          are a computational estimate for prioritising candidates &mdash; not a substitute for
          experimental validation.
        </p>
      </footer>
    </div>
  );
}
