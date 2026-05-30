**Enzyme Stability ML Prediction Platform**

Technical Specification for ML Pipeline and GUI Development

# 1. Purpose and Scope {#purpose-and-scope}

The platform ingests experimental stability data from the hsFAST/GlowTag screening pipeline and trains machine learning models that predict stability-improving mutations for enzymes of interest. Training data scale starts on the order of 5,000--50,000 variants and grows as the data bank expands. A user provides an enzyme sequence and target process conditions through a graphical interface and receives a ranked list of candidate mutations predicted to improve stability without compromising activity.

Stability in this platform is driven by sequence-level information and by the structural and local biochemical context of each residue. The models therefore train on sequence, mutation, condition, and structural features jointly.

This platform is a separate system from the hsFAST Data Layer, but the two are tightly coupled: the Data Layer is the primary source of training and inference-time data for the ML platform. The two systems must interoperate cleanly.

A companion brief, "Enzyme Stability Data Layer and ML Algorithm --- Scientist Input Brief," is in circulation. Its results will refine Sections 4, 5, and 6.

# 2. Users and Example Use Cases {#users-and-example-use-cases}

Three user populations are served: internal scientists running stability engineering campaigns, external customers using the hsFAST platform on their own enzymes, and computational/protein engineers designing mutations rationally before going to the bench. The user experience must accommodate all three without requiring ML expertise from any of them.

## 2.1 Example use cases {#example-use-cases}

- A scientist starting a new stability engineering campaign uploads the FASTA sequence of their enzyme and specifies that the target process condition is 65 °C in 20% v/v ethanol. The platform returns a ranked list of single-point and combinatorial mutations predicted to improve apparent thermostability under those conditions, along with a confidence score and the data basis for each suggestion.

- A scientist has rationally designed a small set of candidate mutations and wants a second opinion. They submit the parent sequence and the proposed mutation list, and the platform scores each proposed mutation for predicted effect on stability and predicted risk of activity loss.

- An internal user wants to understand which residues of a target enzyme are most amenable to stabilization. The platform produces a residue hotspot map showing predicted mutational tolerance and stabilization potential across the sequence.

- A Gold-tier user opens a chat-style interface and asks follow-up questions about a returned mutation set, such as which substitutions are supported by similar enzymes in the data bank, or what conditions in the training set most closely match their target conditions.

# 3. System Architecture {#system-architecture}

Four logical layers, organized as follows.

## 3.1 Data ingestion and curation layer {#data-ingestion-and-curation-layer}

Pulls QC-passed stability records from the hsFAST Data Layer and from directly contributed user data. Joins each record to the parent enzyme sequence (required) and to structural information. When a user-supplied structure is not available, a predicted structure is generated automatically (e.g., via AlphaFold or ESMFold) so that structural features are available downstream for every enzyme in the data bank. Enzyme family annotation is attached using HMMER against Pfam when not supplied.

## 3.2 Feature engineering layer {#feature-engineering-layer}

Converts sequence, mutation, condition, and structural information into numerical feature representations. Structural features (secondary structure, solvent accessibility, distance to active site, contact density, local biochemical environment) are computed for every parent enzyme, not just those with user-supplied structures.

## 3.3 Model layer {#model-layer}

Houses multiple cooperative predictors rather than a single monolithic model. At minimum, separate predictors are trained for each major class of process condition:

- A thermostability predictor, trained on temperature-driven stability outcomes.

- A pH stability predictor, trained on outcomes across acidic and basic conditions.

- A solvent stability predictor, trained on outcomes across organic solvent identity and loading.

- Additional condition-specific predictors as new condition classes enter the data bank (e.g., high ionic strength, high product concentration tolerance).

Each condition-specific predictor can be queried independently when a user's engineering goals are relevant to just one condition class. When the user specifies multiple conditions at once, the relevant predictors are queried together and their outputs combined into a unified ranking. For example, a request for 65 °C in 20% ethanol invokes the thermostability and solvent predictors together. The engineer decides how outputs are combined (weighted ensembling, joint scoring, or a learned meta-predictor); the choice must be justified on validation performance.

A separate activity-risk predictor scores every candidate mutation for predicted impact on enzymatic function. Stability predictions and activity-risk predictions are jointly considered when ranking final candidates returned to the user.

## 3.4 Application layer {#application-layer}

The browser-based GUI, the API behind it, the tiered access controls, and the AI chat assistant at the Gold tier.

The engineer chooses libraries, frameworks, model architectures, and deployment patterns within these layers.

# 

# 4. Training Data {#training-data}

## 4.1 Source and scale {#source-and-scale}

Primary training data source: the hsFAST/GlowTag stability data bank, populated by the hsFAST Data Layer. Initial training set size on the order of 5,000--50,000 variants, growing as the data bank expands. The platform must retrain on a growing dataset on a regular cadence; initial target is monthly, configurable.

## 4.2 Required fields per training record {#required-fields-per-training-record}

Each training record corresponds to a single variant measurement. Required fields:

- Variant identifier.

- Parent (wild-type or reference) enzyme identifier.

- Full parent enzyme sequence as a FASTA string. The model cannot make predictions without the parent sequence, and so this field is non-negotiable for any record entering training.

- Mutation(s) relative to parent, as a structured list (e.g., L241P, A244H).

- Process condition vector for the assay: temperature, pH, ionic strength, solvent identity and loading, and any other condition recorded by the Data Layer.

- Stability readout(s): apparent melting temperature, apparent half-life, endpoint fluorescence retained, or other derived stability metric, with units.

- Replicate count and replicate-level statistics (mean, standard deviation, or equivalent).

- Provenance: reference to the source experiment in the Data Layer.

## 4.3 Optional fields per training record {#optional-fields-per-training-record}

Optional fields. When not supplied directly, the platform derives or imputes them; the model itself always operates on a complete feature set:

- Functional/activity readout for the same variant. Used to train the activity-risk side of the model. Records without an activity readout still contribute to the stability predictors.

- User-supplied structural annotation (PDB identifier, AlphaFold identifier, or uploaded structure file). When not supplied, a predicted structure is generated automatically for the parent and used in feature engineering. Either way, structural features enter the model.

- Enzyme family or functional class annotation. When not supplied, family membership is inferred from the parent sequence using HMMER against Pfam, and the inferred family is attached to the record.

## 4.4 Data quality and provenance {#data-quality-and-provenance}

Only QC-passed records from the Data Layer enter the training set by default. The training pipeline records, for every model version, the exact set of records (by Data Layer identifier and version) used to train it. Records missing the expected hsFAST controls are flagged at ingestion and excluded from training by default; see Section 7. Excluded data points must remain inspectable, never silently dropped.

# 5. Tiered Data Contribution and Access Model {#tiered-data-contribution-and-access-model}

Access to platform capabilities is gated by the amount, completeness, and quality of data the user contributes. Three tiers, implemented as account-level entitlements queryable by the API and the UI.

| **Tier** | **Required Inputs** | **Unlocked Capabilities** |
|----|----|----|
| Bronze | Enzyme sequence (FASTA) and target process conditions. No data contribution required. | A ranked list of proposed mutations only. No qualitative or quantitative stability prediction is surfaced, no confidence scores, no activity-risk scores, no data-bank comparisons. |
| Silver | Bronze inputs plus a contributed set of user-generated stability assay records (a defined minimum number of variants tested under specified conditions; exact threshold to be determined from scientist feedback). | Quantitative predicted stability change with confidence intervals, predicted activity-risk score, residue hotspot map, and access to de-identified comparison data from related enzymes or enzyme families in the data bank. |
| Gold | Silver inputs plus full contribution of stability data including sequences, mutations, and activity readouts for all assayed variants in the user's campaign. | All Silver features, plus access to the AI chat-style assistant for interactive exploration of predictions and the underlying data, full access to de-identified cross-organization data trends, and bespoke retraining on the user's contributed data. |

All cross-user data sharing is de-identified by default. The exact thresholds defining Silver and Gold tiers (number of variants, number of conditions, completeness of metadata) are open questions and will be finalized once scientist feedback is consolidated. Tier definitions should be implemented as configuration, not hard-coded constants.

# 6. Functional Requirements {#functional-requirements}

## 6.1 User inputs at inference time {#user-inputs-at-inference-time}

- Enzyme sequence as a FASTA string. Single-sequence input is required; multi-sequence (batch) input is desirable.

- Target process conditions: temperature, pH, solvent identity and loading, ionic strength, and any other condition class for which a predictor has been trained. The UI surfaces all conditions the platform supports and indicates clearly when a user specifies a condition outside the training distribution for that predictor.

- Optional: a user-supplied parent structure (PDB ID, AlphaFold ID, or uploaded structure file). When omitted, the platform generates a predicted structure and uses it for inference.

- Optional: a user-supplied list of proposed mutations to be scored rather than generated de novo (the rationally selected mutation use case).

- Optional: constraints on mutation type (e.g., conservative substitutions only, exclude active-site residues, limit to a specified residue range).

## 6.2 Predictions returned {#predictions-returned}

Output content depends on the user's tier. The differences below are enforced at the API level, not only at the UI.

### 6.2.1 Bronze tier output {#bronze-tier-output}

- A ranked list of candidate mutations only. No predicted stability change, no confidence score, no activity-risk score, no data-basis information beyond the mutation rank itself.

### 6.2.2 Silver and Gold tier output {#silver-and-gold-tier-output}

- A ranked list of candidate mutations (single-point and, where the model supports it, combinatorial).

- For each candidate: a quantitative predicted effect on stability under the specified conditions, a confidence interval on that prediction, and a predicted activity-loss risk score.

- Rationale per candidate, drawn from the data basis: the number of similar variants in the training set, the closest matching enzymes and conditions, and the structural reasoning.

- A residue hotspot map across the parent sequence, showing per-residue predicted mutational tolerance and stabilization potential.

- When a user supplies their own proposed mutations: the same fields as for generated candidates, plus a side-by-side comparison to the platform's own top suggestions for the same residue.

## 6.3 Feature engineering requirements {#feature-engineering-requirements}

The feature engineering layer must, at minimum, produce the following feature classes for every variant record and every inference request:

- Sequence-level features: encoded amino acid identity, position, and local sequence context. Use of pretrained protein language model embeddings (ESM family or equivalent) is encouraged.

- Mutation-level features: parent identity, substituted identity, physicochemical change (charge, hydrophobicity, volume), and position-specific conservation derived from the family alignment.

- Condition features: a structured representation of process condition that supports interpolation between conditions seen in training, on a per-condition-class basis.

- Structural features (required for every prediction): secondary structure assignment, solvent accessible surface area, distance to active site, contact density, residue burial, and local biochemical context (hydrogen bonding partners, hydrophobic packing, electrostatic neighborhood). These are computed from the supplied or predicted structure of the parent enzyme. The model does not run without them.

- Family features: family annotation from HMMER/Pfam, used to weight family-similar training records during inference and to scope which model heads contribute to a prediction.

## 6.4 Model layer requirements {#model-layer-requirements}

- Multiple cooperative predictors as defined in Section 3.3, plus the activity-risk predictor. The engineer selects architectures and is not constrained to any single approach.

- Inference must work on enzymes not in the training set, including from sparsely represented families. The platform must clearly flag sequences with low sequence similarity to any enzyme in the existing database; see Section 7.

- Mandatory versioning. Every prediction returned to a user must be traceable to a specific model version and to the training data snapshot used to produce that version.

- Regular retraining on the growing data bank, with held-out validation. The validation strategy must include held-out enzymes (not just held-out variants within enzymes already in training) to test generalization across protein families.

- Standard model performance metrics reported per version: regression metrics for the stability predictors, classification metrics for the activity-risk predictor, and calibration of confidence scores against held-out ground truth.

## 6.5 User Interface {#user-interface}

Browser-based, no ML expertise required of the user. Required views:

### 6.5.1 Sequence and conditions input view {#sequence-and-conditions-input-view}

- FASTA paste-in or file upload, with sequence validation feedback.

- Structured form for target process conditions, with sensible defaults pulled from the training distribution.

- Optional toggles for user-supplied structure, mutation constraints, and rationally proposed mutations.

- Clear indication of the user's current tier and which capabilities are available to them.

### 6.5.2 Predictions view {#predictions-view}

- Ranked, sortable, filterable table of predicted mutations with all fields appropriate to the user's tier.

- One-click drill-down on any candidate (Silver and Gold) to see the data basis: which training variants and conditions most influenced the prediction, and the structural reasoning.

- Residue hotspot map (Silver and Gold) rendered as an interactive plot over the parent sequence.

- Conspicuous flagging when the input sequence has low similarity to any enzyme in the existing database.

### 6.5.3 Proposed-mutation evaluation view {#proposed-mutation-evaluation-view}

- When a user supplies their own mutations, side-by-side display of user proposals and platform suggestions for the same residues, with predicted-effect comparison.

### 6.5.4 AI chat assistant (Gold tier) {#ai-chat-assistant-gold-tier}

- Chat-style interface scoped to a specific prediction run. Users can ask follow-up questions about the suggestions, the underlying data, and the reasoning.

- The assistant operates only on the platform's data and predictions. It must not fabricate stability values or invent supporting variants that are not in the training set. Every quantitative claim must be traceable to a record in the data bank.

### 6.5.5 Export and reporting {#export-and-reporting}

- Export of any predictions table to CSV.

- Export of plots to PNG and SVG.

- Generation of a single PDF or HTML report summarizing a prediction run, suitable for inclusion in a project document.

# 7. Data Quality, Statistics, and Trust {#data-quality-statistics-and-trust}

Statistical handling lives almost entirely in the training data curation step, not in the user-facing output. The user sees a ranked list of mutations, not a list of t-tests. What follows describes how the platform earns the right to surface that list.

## 7.1 Controls in training data ingestion {#controls-in-training-data-ingestion}

- Standard hsFAST controls are required for any experiment entering the training set: negative controls (no hsFAST tag, no construct) and positive controls (hsFAST only, and hsFAST fused to a known well-expressing partner).

- Records from experiments missing the expected controls, or where the controls behave anomalously, are flagged at ingestion and excluded from training by default.

## 7.2 Replicate handling and outlier exclusion (training-time) {#replicate-handling-and-outlier-exclusion-training-time}

- Standard outlier tests (Grubbs' or Tukey's fences) applied per condition before replicate averaging.

- Standard statistical tests (e.g., two-sided t-tests) applied during training data curation to determine whether the measured stability difference between a variant and its parent is significant given the replicate variance. Differences that do not pass that bar do not become training signal for an "improved" outcome.

- All exclusions are recorded with the reason and remain inspectable in the data bank, never silently dropped.

## 7.3 Confidence on user-facing predictions {#confidence-on-user-facing-predictions}

- Quantitative confidence intervals returned with Silver- and Gold-tier predictions must be calibrated against held-out ground truth, and calibration metrics must be reported for every model version.

- Bronze-tier output carries no confidence values; mutations are listed in rank order only.

## 7.4 Provenance {#provenance}

- Every Silver- or Gold-tier prediction carries enough data-basis information that a scientist can inspect the training records most influential to that prediction, and the model version and training snapshot that produced it.

## 

## 7.5 Sequence similarity to the database {#sequence-similarity-to-the-database}

- When a user submits an enzyme sequence with low sequence similarity to any enzyme in the existing database, the predictions for that sequence must be flagged conspicuously in the UI and API. The platform does not silently extrapolate into sparse regions of sequence space.

# 8. Open Questions {#open-questions}

- Exact thresholds defining the Silver and Gold tiers (number of variants, number of conditions, completeness).

- Minimum number of training data points and minimum number of unique proteins / protein families required before the platform surfaces Silver and Gold predictions for a given enzyme family. To be informed by scientist input.

- Specific choice of pretrained protein language model and structure predictor (AlphaFold, ESMFold, other), and whether to fine-tune. The engineer should propose options based on current state of the art.

- How condition-specific predictor outputs are combined when a user specifies multiple conditions: weighted ensemble, joint scoring, or a learned meta-predictor. To be decided based on validation performance.

- Hosting model: on-premises, single-tenant cloud, or multi-tenant SaaS.

- Authentication provider: in-house, SSO integration, or third-party identity (e.g., Auth0, Okta).

- Customer data export policy. Placeholder --- not yet decided what customers should be able to download, when, and in what form. Direction to follow.

- Whether the AI chat assistant at the Gold tier is built on an off-the-shelf LLM with retrieval over the data bank, or on a more constrained custom solution. To be decided jointly with the engineer.

# 9. Companion Materials {#companion-materials}

- Enzyme Stability Data Layer and ML Algorithm --- Scientist Input Brief (in circulation; results will refine Sections 4, 5, and 6 of this document).

- hsFAST Data Layer Technical Specification (the upstream system that supplies training and inference-time data).

- Representative example training records, once the Data Layer schema is finalized.

- Shin et al. (2025), ACS Synth. Biol., DOI: 10.1021/acssynbio.5c00573, for background on the hsFAST reporter itself.

# 10. Acceptance Criteria for the MVP {#acceptance-criteria-for-the-mvp}

The MVP is acceptance-ready when an internal scientist can:

- Paste a FASTA sequence into the GUI, specify a set of target process conditions, and receive a ranked list of predicted mutations within seconds. Output content matches the tier of the account used.

- At Silver or Gold, see, for every returned mutation, a confidence interval, a predicted effect on stability, a predicted activity-loss risk, and a clear data basis drawn from the training set including the structural reasoning.

- Submit a data-verified proposed mutation and receive a platform evaluation alongside the platform's own top suggestions for the same residue.

- View an interactive residue hotspot map across the input sequence (Silver tier or higher).

- See conspicuous flagging when the input sequence has low similarity to any enzyme in the existing database.

- Inspect the model version, training data snapshot, and validation performance backing every prediction they see.

- Export both the underlying numbers and at least one plot for use in an external presentation.

- Trust the result: every quantitative claim should be traceable back to specific records in the data bank.

## 10.1 Independent test-set validation {#independent-test-set-validation}

Before release, the model is evaluated on a set of variants held out from training entirely --- including held-out enzymes, not just held-out variants of training enzymes. The platform reports the concordance between predicted and measured stability changes for that held-out set. The MVP is considered validated when this concordance shows that mutations the model promotes are, in the underlying held-out data, mutations that did in fact produce stability improvements. The held-out set, the comparison, and the result are all part of the deliverable.
