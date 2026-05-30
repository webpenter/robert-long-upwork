**hsFAST Data Layer & Analysis Platform**

Technical Specification for Software Development

# 1. Overview {#overview}

We are designing an interactive data analysis platform built around our hsFAST/GlowTag enzyme stability screening technology. The platform must accept raw assay data from standard laboratory instruments (plate readers and flow cytometers), compute scientifically meaningful stability metrics, and present results through a graphical interface that supports interactive exploration, longitudinal trend analysis, and structured comparison across enzyme variants and experimental conditions.

End users include both our internal scientists and external customers. The platform must support deep, day-to-day analytical workflows for internal teams as well as a simpler, customer-facing experience where external users can upload their own data and receive interpretable, actionable output.

In parallel, we are circulating a Scientist Input Brief to gather more granular user requirements. Inputs from that brief will refine portions of this specification, particularly around the exact column-level schema for data ingestion.

# 2. Scientific and Technical Background {#scientific-and-technical-background}

hsFAST (also referred to as GlowTag) is a 14 kDa, oxygen-independent, reversible translational fluorescent reporter developed for high-throughput screening of enzymes for thermal and chemical stability. When fused to a partner protein, hsFAST fluoresces only when the fusion is properly folded, so fluorescence intensity reports on the folding state --- and therefore the stability --- of the partner protein.

Because hsFAST is itself highly stable, it can be used as a modular reporter across process-relevant conditions, including elevated temperature, extreme pH, high ionic strength, and solvent loading. The technology is applicable to any protein whose folding state can be coupled to a reporter signal.

Reference: *Shin et al. (2025), ACS Synth. Biol. DOI: 10.1021/acssynbio.5c00573.*

The platform supports both kinetic measurements (fluorescence sampled over time during incubation under stress conditions) and endpoint measurements (fluorescence at a defined time after stress exposure). Data are collected on plate readers and flow cytometers (FACS); the platform must accommodate the output formats produced by these instruments.

# 3. System Goals {#system-goals}

- **Ingestion.** Accept standardized raw data files (.xlsx and .csv) from plate readers and flow cytometers with minimal manual reformatting.

- **Standardization.** Enforce consistent metadata, units, and controls so that data are directly comparable across runs, instruments, and laboratories.

- **Computation.** Derive scientifically meaningful stability metrics, including denaturation curves, apparent melting temperatures (apparent Tₘ), apparent half-lives, and replicate statistics.

- **Visualization.** Provide interactive, publication-quality plots and dashboards for kinetic, endpoint, and curve-based analyses.

- **Comparison.** Enable structured comparison of variants, conditions, and runs, both within a single experiment and across the entire historical dataset.

- **Trend tracking.** Track how enzyme stability performance is improving over time across an engineering campaign.

- **Sequence--stability insight.** Connect variant performance to amino acid substitutions and surface mutations associated with improved stability, when sequence data are available.

- **Multi-user access.** Support both internal scientific users and external customers with appropriate data isolation.

# 4. Target Users and Use Cases {#target-users-and-use-cases}

## 4.1 User Types {#user-types}

| **User type** | **Primary needs** |
|----|----|
| Internal scientist | Daily ingestion of assay output; deep, interactive analysis; QC of raw data; campaign-level trend tracking; sequence--stability hypothesis generation. |
| Internal project lead | Cross-project rollups; longitudinal stability improvement reports; comparison of variants to parent and to best-in-class controls. |
| External customer | Upload of their own assay data; clean, interpretable output; comparison of their variants under standard conditions; export of plots and tables for reports. |
| Administrator | User and tenant management; instrument template management; reference / control standards configuration; audit and data governance. |

## 4.2 Example Use Cases {#example-use-cases}

- A scientist uploads a plate-reader file from a thermal challenge experiment and, within minutes, sees fitted denaturation curves and ranked apparent Tₘ values for every variant on the plate.

- A scientist selects a single variant and views all historical data for that variant: every condition tested, every replicate, every derived metric, with full provenance.

- A project lead opens a campaign dashboard and sees a trend line showing how the best apparent Tₘ in the campaign has shifted over the past six months, with the responsible variants annotated.

- A scientist multi-selects ten variants and overlays their kinetic decay curves at 60 °C to compare apparent half-lives side by side.

- A scientist filters the variant library to all variants carrying a substitution at a particular residue and asks the platform whether substitutions at that position correlate with improved stability.

- An external customer uploads their own .xlsx file, the platform validates it against the standard template, and the customer receives an interactive results page they can share internally.

# 5. High-Level System Architecture {#high-level-system-architecture}

The platform should follow a standard multi-tier web architecture with these logical layers:

| **Layer** | **Responsibility** |
|----|----|
| Ingestion layer | Accept and parse uploaded .xlsx / .csv files from supported instruments; validate against expected schemas; surface clear errors to the user. |
| Data store | Persist projects, experiments, samples, variants, sequences, conditions, raw measurements, derived metrics, and user metadata. Must preserve provenance from raw upload through to final visualization. |
| Analytics engine | Apply normalization, curve fitting, replicate aggregation, and statistical QC. Must be reproducible and versioned so that re-running on the same input yields the same output. |
| API layer | Expose data and analytics to the GUI and (optionally) to programmatic consumers. RESTful or GraphQL is acceptable. |
| Web GUI | Browser-based, interactive interface. Must support uploads, dashboards, variant detail views, curve overlays, comparison views, and filtering. |
| Auth and tenancy | User authentication, role-based access control, and strict isolation between customer tenants and internal data. |

# 6. Functional Requirements {#functional-requirements}

## 6.1 Data Ingestion {#data-ingestion}

The platform accepts data from two standard assay formats. Both arrive as .xlsx or .csv files and share a common required column set: variant ID, well or sample position, fluorescence, and additional experimental metadata. Sequence and mutation information is an optional input in both formats --- some customers will not want to share sequence data, and the platform must function fully without it. When sequence data are provided, the platform should use them to enable the sequence-aware analysis described in Section 6.5.

**Plate reader fluorescence assays.** Standard .xlsx or .csv exports with columns for variant ID, well plate position (e.g., A1, B2), fluorescence reading(s) (kinetic time series or endpoint value), and metadata. Sequence and mutation information for each variant is an optional metadata input.

**Flow cytometry (FACS) fluorescence assays.** Users run FACS to obtain fluorescence per sorted population, then perform sequencing on those sorted variants to identify which substitutions correlate with improved fluorescence (and therefore improved stability). The platform accepts .csv or .xlsx exports linking variant ID to fluorescence values, with sequence and mutation data from the downstream sequencing as optional metadata.

Ingestion requirements:

- File parsing must be template-driven. The platform should ship with a standard data input template; ingestion must validate uploads against this template. The exact column-level schema will be finalized as we consolidate scientist feedback.

- On upload, the platform must perform schema validation, unit checks, control checks, and replicate checks, and must clearly report problems with actionable messages (e.g., "No negative control identified on plate. Expected a well labeled 'NC' in the plate map.").

- The platform must allow users to supply missing or supplemental metadata at upload time through a guided form (e.g., instrument used, plate map, condition definitions, sample-to-variant mapping).

- All raw uploads must be retained in their original form and linked to the parsed records, so that uploads can be re-parsed if the analytics layer changes.

- The ingestion layer should be designed so that new instrument formats can be added with minimal code change --- ideally via configuration.

## 6.2 Data Model {#data-model}

The following entities should anchor the data model:

| **Entity** | **Description and key attributes** |
|----|----|
| Project / Campaign | A logical grouping of related engineering work (e.g., "Enzyme X thermostability campaign"). Owner, description, target enzyme, start date. |
| Experiment / Run | A single experimental session, typically corresponding to one or more uploaded files. Date, operator, instrument, assay type (thermal, pH, solvent, etc.), free-text notes. |
| Acquisition / Plate | A single physical plate or FACS acquisition within a run. Plate ID, layout, instrument settings. |
| Sample / Well | An individual measurement location (well or gated population). Linked to a variant and a condition. |
| Variant | An enzyme variant defined by its parent enzyme and a set of mutations. Amino acid sequence stored as a FASTA string with a structured mutation list (e.g., A123V, L456P). Sequence and mutation data are optional inputs (see Section 6.1). |
| Condition | The experimental condition applied to a sample (temperature, pH, buffer, ionic strength, co-solvent and concentration, incubation time, etc.). |
| Replicate | Grouping of samples that should be treated as biological or technical replicates of the same variant--condition pair. |
| Raw measurement | Per-sample fluorescence value(s). For kinetic data, a time series; for endpoint, a scalar. |
| Derived metric | Computed values such as fitted apparent Tₘ, fitted apparent half-life, EC₅₀ of a denaturant, residual activity, fold-change vs. parent, QC flags, and the version of the analytics code used. |
| Control reference | Designated controls required for normalization and comparison. The standard control set is: negative controls (no hsFAST tag and no construct) and positive controls (hsFAST alone, and hsFAST fused to a known protein with good expression). |
| User / Tenant | Identity and organizational scope for access control. Customers must not see internal or other-customer data. |

The data model must explicitly preserve the hierarchy Project → Experiment → Acquisition → Sample → Replicate, and must allow the same variant or same condition to appear across many experiments. Cross-experiment queries ("show me all measurements of variant V at 65 °C across all runs") are a first-class use case, not an afterthought.

## 6.3 Data Processing and Analytics {#data-processing-and-analytics}

All calculations must be reproducible and versioned. At minimum, the analytics engine must support:

### 6.3.1 Kinetic data {#kinetic-data}

- Fit per-well fluorescence-vs-time curves to a single-exponential decay model (with alternative models available where appropriate).

- Report apparent rate constant (k), apparent half-life (t½), and goodness-of-fit metrics.

- Allow user override of the fit window (e.g., exclude an initial dead time).

### 6.3.2 Endpoint data {#endpoint-data}

- Normalize raw fluorescence to controls (e.g., percent of unstressed control).

- Aggregate replicates with mean, standard deviation, and standard error; flag outliers.

- Report fold-change relative to a user-selectable reference variant (typically the parent / wild-type).

### 6.3.3 Denaturation curves {#denaturation-curves}

- Fit normalized signal vs. denaturant level (temperature, pH, chemical denaturant concentration) to a sigmoidal model.

- Extract midpoint values: apparent Tₘ for thermal melts, pHₘ for pH curves, \[denaturant\]₀.₅ for chemical denaturation. These must be labeled as apparent values; the platform must not present them as absolute values such as an absolute melting temperatures.

- Report the fitted curve, the midpoint value with confidence interval, and goodness-of-fit metrics.

### 6.3.4 Statistics and QC {#statistics-and-qc}

- Use standard statistical conventions: t-tests for pairwise comparisons between variants, standard outlier tests (e.g., Grubbs') for individual replicates, and standard error of the mean for aggregated replicate values.

- Flag samples that fail QC: missing replicates, replicate variance above a threshold, low signal-to-noise, control failures, poor curve fits.

- Allow the user to exclude individual wells or replicates from analysis, with the exclusion recorded as part of provenance.

- Never silently drop data. Excluded data must remain queryable.

## 6.4 User Interface and Visualization {#user-interface-and-visualization}

The GUI must be browser-based and interactive. Required views:

### 6.4.1 Upload and validation view {#upload-and-validation-view}

- Drag-and-drop upload of one or more files.

- Inline validation feedback with field-level error highlighting.

- Guided form for any required metadata the file does not provide.

### 6.4.2 Run / experiment view {#run-experiment-view}

- Summary of the experiment: date, operator, instrument, conditions tested, variants tested, QC status.

- Plate heatmap view for plate-based assays, with hover-to-inspect on each well.

- One-click drill-down from any well or sample to its raw trace and fitted curve.

### 6.4.3 Variant detail view {#variant-detail-view}

- All data ever collected on a single variant, across all experiments and conditions.

- Display of the variant's amino acid sequence (FASTA) and structured mutation list, when provided.

- Summary metrics card: best observed apparent Tₘ, best observed apparent half-life under reference conditions, number of independent measurements.

- Linked raw and processed data, with full provenance to the source upload.

### 6.4.4 Comparison view {#comparison-view}

- Multi-select any set of variants and overlay their data: kinetic decay curves, denaturation curves, endpoint bar charts, etc.

- Side-by-side metric tables with sortable columns.

- Statistical comparison (e.g., is the difference in apparent Tₘ between two variants significant given the replicate variance).

### 6.4.5 Campaign / trend dashboard {#campaign-trend-dashboard}

- Time-series view of best-in-campaign stability metrics, showing how performance has improved over the life of the project.

- Annotated points indicating which variant achieved each new best.

- Filter by condition (e.g., "best apparent Tₘ at pH 5" vs. "best apparent Tₘ at pH 8").

### 6.4.6 Filtering and search {#filtering-and-search}

- Filter any view by project, experiment, variant, condition, date range, operator, instrument, mutation, or residue position.

- Saved filters and shareable URLs for views.

All plots must be interactive (hover for values, zoom, pan, toggle series on and off) and exportable as both image (PNG/SVG) and underlying data (CSV).

## 

## 6.5 Sequence and Mutation Analysis {#sequence-and-mutation-analysis}

When users provide sequence and mutation information (an optional input --- see Section 6.1), the platform must support:

- A structured mutation list for each variant, relative to a defined parent sequence (e.g., A123V; L456P), with the full sequence stored as a FASTA string.

- Variant library queries by mutation (e.g., "all variants carrying a substitution at residue 123") or by substitution identity (e.g., "all variants with A→V at any position").

- Aggregated stability metrics across all variants carrying each substitution, to surface substitutions that correlate with improved stability.

- A residue-level summary view aggregating, per residue position, the substitutions tested and the observed stability effects, to guide future design.

- Clear indication that effects are correlative rather than causal where multiple mutations co-occur in the same variant. The platform must not overstate individual-mutation attribution.

- Optional ingestion of structural annotations (e.g., domain boundaries, active-site residues, secondary structure assignments). When users supply these, the residue-level summary view should incorporate them so users can see where in the protein their improvements are occurring and gain insight into why certain substitutions are beneficial.

- Biochemically relevant insights such as improvements to hydrophobic packing, disulfide bridge formation, or charge optimization improving stability. These should be assessed both locally and globally on the protein sequence and structure, where possible.

## 6.6 Output and Export {#output-and-export}

- Export of any plot as PNG and SVG.

- Export of any tabular view as CSV and XLSX, including all metadata columns required to reproduce the view.

- Shareable, permission-aware links to specific views (e.g., a customer-facing variant report).

- Optional generation of a structured PDF report summarizing an experiment or a variant.

# 7. Non-Functional Requirements {#non-functional-requirements}

- **Authentication and access control.** Role-based access. Internal users, customer users, and administrators have distinct permissions. Customer tenants must be strictly isolated from each other and from internal data.

- **Provenance and reproducibility.** Every displayed value must be traceable to its raw upload and to the version of the analytics code that produced it. Re-running analytics on the same input must yield the same output.

- **Auditability.** Record who uploaded what, who changed what, and when. Excluded or flagged data must remain queryable.

- **Performance.** Interactive views over the full historical dataset should remain responsive (sub-second for filter operations on typical campaign sizes).

- **Extensibility.** New instrument formats, new derived metrics, and new visualization types should be addable without invasive refactoring.

- **Data security.** Sequence data and customer data are sensitive. Transport encryption, encryption at rest, and reasonable retention controls are required.

- **Backup and recovery.** Raw uploads and derived data must be backed up; documented recovery procedures expected.

# 8. Open Questions and Decisions Required {#open-questions-and-decisions-required}

The following items remain open. We will provide direction on these in collaboration with the engineering team as planning proceeds:

- Preferred technology stack: frontend framework, backend language, database.

- Hosting model: on-premises, single-tenant cloud, or multi-tenant SaaS. This decision materially affects the data security and tenancy design.

- Authentication provider: in-house, SSO integration, or third-party identity (e.g., Auth0, Okta).

- Exact column-level schema for the data input template. This can be iterated upon with consolidated scientist feedback from the Scientist Input Brief.

- Customer data export policy. Placeholder --- we have not yet decided what customers should be able to download, when, and in what form. Direction to follow.

# 9. Companion Materials {#companion-materials}

The following supporting documents should be reviewed alongside this specification:

- Enzyme Stability Data Analysis Pipeline --- Scientist Input Brief (in circulation; results will refine Section 6.1 of this document).

- Example data files from each supported instrument.

- Shin et al. (2025), ACS Synth. Biol., DOI: 10.1021/acssynbio.5c00573, for background on the hsFAST reporter itself.

# 10. Acceptance Criteria for the MVP {#acceptance-criteria-for-the-mvp}

The initial release should be considered acceptance-ready when an internal scientist can:

- Upload a plate-reader file from a real hsFAST stability experiment without manual preprocessing.

- See validation feedback within seconds and correct any flagged issues through the UI.

- View the resulting plate heatmap, drill into any well, and see the raw trace and fitted apparent half-life.

- Open the variant detail page for any tested variant and see every measurement ever collected on it.

- Export both the underlying numbers and at least one plot for use in an external presentation.

- Trust the result: every displayed value should be traceable back to the original uploaded file.
