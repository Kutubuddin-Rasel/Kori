---
title: "Kori Backend + AI/ML Engineering Roadmap"
subtitle: "A 20-week practical roadmap for fraud detection, model serving, and ML engineering"
author: "Prepared for Kutubuddin Juwel"
date: "September 2026"
toc: true
toc-depth: 3
numbersections: true
geometry: margin=0.75in
fontsize: 10pt
colorlinks: true
linkcolor: blue
urlcolor: blue
---

# How to use this roadmap

This roadmap is designed around your actual situation:

- You are continuing **Kori**, a NestJS/PostgreSQL/Redis Mobile Financial Service backend.
- You plan to spend roughly **5-6 hours per day on Kori**.
- You can spend **1-2 additional hours per day on AI/ML learning**.
- Your immediate career remains software/backend engineering, while you deliberately add practical ML engineering skills.
- The AI/ML capstone is not a generic chatbot. It is a **fraud/risk detection subsystem for Kori**.

The roadmap is intentionally narrow. You are not trying to learn every AI topic. You are learning the concepts required to build, evaluate, deploy, explain, and monitor a real tabular fraud model.

## The final outcome

At the end of the roadmap, you should be able to demonstrate a system like this:

```text
                    KORI
                     |
        +------------+-------------+
        |                          |
  NestJS Financial Core       Python Risk Service
        |                          |
  Auth / Wallets              Feature processing
  Transactions                Fraud model
  Ledger                      Anomaly model
  Idempotency                 SHAP explanation
  PostgreSQL                  Model version
  Redis                       FastAPI
        |                          |
        +------ Risk Result -------+
                     |
               Policy Engine
                     |
           ALLOW / REVIEW / BLOCK

Initial production behavior: SHADOW MODE
The model records predictions but does not control money movement.
```

The financial system must remain deterministic. The ML service can recommend risk; it must not directly mutate balances, ledger entries, or transaction state.

# Non-negotiable sequencing for Kori

Before ML is allowed into the transaction path, finish the important Kori v1 correctness work already identified in the repository audit and roadmap. In particular:

1. Correct UserId vs WalletId boundaries.
2. Make authentication/session boot reliably.
3. Make database-side lock ordering deterministic and prove concurrency behavior with real PostgreSQL tests.
4. Bind idempotency to request intent, not only a client key.
5. Revalidate mutable financial invariants under lock.
6. Protect ledger and transaction invariants with integration tests.
7. Make fresh bootstrap deterministic.
8. Containerize and deploy the backend only after the correctness gates pass.

For the first several weeks, your AI learning runs **beside** Kori. Do not rush to place a model inside an unproven financial path.

# Technology boundaries - how to avoid getting confused

Do not think of Python as replacing TypeScript.

## NestJS owns

- users and authentication
- wallets
- transaction commands
- transaction policies
- ledger and balances
- authorization
- idempotency
- database locking
- risk-policy enforcement
- audit and financial correctness

## Python owns

- exploratory data analysis
- feature engineering for ML
- model training
- model evaluation
- experiment tracking
- model artifacts
- inference
- explanation
- anomaly detection

## Shared contract

The services communicate using an explicit versioned request/response contract. A prediction should look conceptually like:

```json
{
  "score": 0.82,
  "riskBand": "HIGH",
  "modelVersion": "fraud-v3",
  "reasonCodes": [
    "HIGH_VELOCITY_1H",
    "AMOUNT_OUTLIER",
    "NEW_COUNTERPARTY"
  ]
}
```

NestJS remains the authority that decides what happens next.

# Weekly learning system

Use six focused learning days and one light review/rest day. At 1-2 hours per day, this gives roughly 8-12 focused AI/ML hours each week.

## Default 90-minute session

- **20 minutes - concept:** read/watch one focused lesson.
- **40 minutes - implementation:** write the code yourself.
- **20 minutes - experiment:** change inputs, thresholds, features, or parameters and observe what breaks.
- **10 minutes - engineering notes:** write what you learned, what confused you, and how the concept might apply to Kori.

If you have two hours, spend the extra time on coding and experiments, not on another lecture.

## Rule for using AI while learning

AI can be your tutor and reviewer, but should not become your implementation generator.

For each new concept:

1. Learn the concept from the primary resource.
2. Attempt the exercise yourself.
3. Write your explanation in your own words.
4. Only then ask AI to review your reasoning, find mistakes, or propose edge cases.
5. If AI provides code, rewrite the important parts yourself and explain every line that affects the algorithm or evaluation.

A useful test is: **could you reproduce the idea the next day with documentation but without the previous AI conversation?**

# Evaluation philosophy

You do not pass a topic because you watched it. You pass when you can explain it, implement it, test it, and recognize at least one failure mode.

For every week, use four checks:

- **Explain:** Can I explain the concept without reading notes?
- **Implement:** Can I build a small version from scratch or with the intended library?
- **Diagnose:** Can I identify a common mistake or failure mode?
- **Apply:** Can I explain how this affects Kori's fraud/risk system?

Score each 0-2:

- 0 = cannot do it
- 1 = can do it with notes/help
- 2 = can do it independently

A weekly topic is complete when the total is at least **7/8**. If it is lower, repeat the weak part before moving on.

# Phase 1 - Python for ML engineering

## Week 1 - Python fundamentals for an experienced programmer

### Learn

- Python execution model at a practical level
- variables and built-in types
- strings
- lists, tuples, sets, dictionaries
- indexing and slicing
- comprehensions
- functions
- positional and keyword arguments
- `*args` and `**kwargs` conceptually
- modules and packages
- exceptions
- reading/writing text, CSV, and JSON
- virtual environments
- package installation

### Do not spend time on yet

- metaclasses
- descriptors
- advanced decorators
- framework internals
- clever Python tricks

### Primary resource

[The Python Tutorial - official documentation](https://docs.python.org/3/tutorial/index.html)

It is specifically written for programmers who are new to Python rather than people new to programming.

### Mini-project 1 - Transaction Log Analyzer CLI

Create a small CSV with fields such as:

```text
transaction_id,user_id,type,amount,timestamp,status
```

Build a CLI that can:

- load the file
- validate basic input
- filter by user
- filter by transaction type
- compute total and average amount
- show largest transactions
- count transactions by hour
- export a JSON summary

### Evaluation gate

Without copying previous code, write a function that receives a list of transaction dictionaries and returns:

- total amount
- mean amount
- counts by transaction type
- top three transactions

Add at least five tests or assertions, including malformed input.

## Week 2 - Python engineering habits

### Learn

- classes vs dataclasses
- type hints
- `Optional`, unions, generics at a practical level
- enums
- iterators and generators
- context managers
- pathlib
- logging basics
- project/package layout
- pytest basics
- dependency management using a virtual environment; `uv` or standard `venv` is enough

### Mini-project 2 - Typed Transaction Domain Package

Refactor the previous project into:

```text
transaction_lab/
  pyproject.toml
  src/transaction_lab/
    models.py
    parser.py
    analytics.py
  tests/
```

Represent transactions with typed objects or dataclasses. Separate parsing from analytics. Add pytest tests.

### Evaluation gate

You should be able to explain:

- why Python type hints do not make Python statically typed in the same way as TypeScript
- when a dataclass is useful
- why business/data parsing should not be mixed with presentation
- how pytest discovers and runs tests

# Phase 2 - Data foundations and mathematical intuition

## Week 3 - NumPy and vectorized thinking

### Learn

- arrays and `ndarray`
- dimensions, shape, dtype
- indexing and slicing
- boolean masks
- vectorized operations
- broadcasting
- reductions: sum, mean, min, max
- random-number generation and seeds
- dot product
- basic matrix operations

### Primary resource

[NumPy Quickstart](https://numpy.org/doc/stable/user/quickstart)

### Mini-project 3 - Vectorized Risk Feature Calculator

Generate 100,000 synthetic transaction amounts and timestamps.

Calculate with NumPy:

- z-score style amount deviation
- account-level mean and standard deviation
- normalized amount
- simple risk flags

Compare a Python loop with a vectorized NumPy implementation. Measure runtime, but treat the measurement as an experiment rather than a resume claim.

### Mathematics alongside the code

Learn only the intuition you need now:

- scalar vs vector vs matrix
- mean and variance
- standard deviation
- percentiles
- dot product
- Euclidean distance

### Evaluation gate

Given a 2D NumPy array, explain its shape and perform column-wise statistics without loops.

## Week 4 - pandas, visualization, statistics, and time windows

### Learn - pandas

- Series and DataFrame
- CSV/Parquet reading
- column selection
- filtering
- missing values
- `groupby`
- `agg`
- joins/merge
- categorical columns
- datetime conversion
- resampling
- rolling windows
- sorting
- creating derived columns

### Learn - visualization

Use Matplotlib for:

- histogram
- bar chart
- line plot
- scatter plot
- box plot

### Learn - statistics

- mean vs median
- variance / standard deviation
- percentiles
- skewness intuition
- distributions
- correlation vs causation
- conditional probability intuition
- outliers
- sampling

### Primary resources

- [pandas Getting Started](https://pandas.pydata.org/docs/getting_started/)
- [Matplotlib Tutorials](https://matplotlib.org/stable/tutorials/index)
- Optional deeper reading: [An Introduction to Statistical Learning with Python](https://www.statlearning.com/)

### Mini-project 4 - Behavioral Transaction EDA

Create or generate at least 20,000 transactions across many users.

Produce a short Markdown report containing:

- transaction distribution by type
- amount distribution
- amount percentiles
- activity by hour
- per-user average amount
- transactions in rolling 5-minute / 1-hour / 24-hour windows
- top counterparties
- at least three observations that could become fraud features

### Evaluation gate

Given a timestamped transaction table, independently calculate:

- transaction count in the previous hour
- total value in the previous 24 hours
- unique counterparties in the previous 24 hours

# Phase 3 - Core machine learning methodology

## Week 5 - Problem framing, datasets, splits, baselines, leakage

This week matters more than learning a fancy model.

### Learn

- supervised vs unsupervised learning
- classification vs regression
- features (`X`) and labels (`y`)
- training, validation, and test sets
- random split vs chronological/time split
- baseline model
- generalization
- data leakage
- target leakage
- proxy labels
- feature availability at prediction time
- reproducibility and random seeds

### Primary resources

- [Google Machine Learning Crash Course](https://developers.google.com/machine-learning/crash-course)
- Focus especially on datasets, generalization, and overfitting.
- [Inria scikit-learn MOOC](https://inria.github.io/scikit-learn-mooc/)

### Mini-project 5 - Leakage Detective

Create a small fraud dataset with a deliberately leaked feature such as `review_result` or `post_transaction_balance_after_manual_reversal`.

1. Train a model including the leaked feature.
2. Observe the suspiciously strong result.
3. Remove the feature.
4. Document why the original experiment was invalid.

### Evaluation gate

For every proposed Kori fraud feature, answer:

> Does this value exist before the risk decision is made?

If the answer is no, it cannot be used for real-time scoring.

## Week 6 - Logistic regression and classification metrics

### Learn

- linear model intuition
- logistic regression
- probability output
- decision threshold
- confusion matrix
- true positive / true negative / false positive / false negative
- accuracy
- precision
- recall
- F1
- ROC curve and ROC-AUC
- precision-recall curve
- Average Precision / PR-AUC
- threshold trade-offs

### Primary resources

- Google ML Crash Course classification modules and exercises
- [scikit-learn Precision-Recall example](https://scikit-learn.org/stable/auto_examples/model_selection/plot_precision_recall.html)
- ISLP classification chapter if you want deeper explanation

### Mini-project 6 - Fraud Metrics Lab

Use a tiny manually constructed dataset first.

Calculate TP, FP, TN, FN, precision, recall, and F1 **by hand**. Then verify with scikit-learn.

Create a threshold sweep from 0.05 to 0.95 and record how precision and recall change.

### Evaluation gate

Explain without notes:

- why 99.8% accuracy can still be a useless fraud model
- the difference between precision and recall
- why a threshold of 0.5 is not automatically correct
- what business cost a false positive and false negative could have in an MFS

## Week 7 - Preprocessing, pipelines, cross-validation, regularization

### Learn

- numerical vs categorical features
- standardization
- normalization concept
- one-hot encoding
- missing-value handling
- scikit-learn `Pipeline`
- `ColumnTransformer`
- cross-validation
- stratification
- regularization intuition
- bias and variance
- underfitting vs overfitting

### Mini-project 7 - Reproducible Classification Pipeline

Create a mixed numerical/categorical dataset.

Build one scikit-learn pipeline that:

- imputes missing data
- scales numerical features when appropriate
- encodes categorical features
- trains logistic regression
- evaluates with cross-validation

Make sure all preprocessing happens inside the pipeline.

### Evaluation gate

Explain why preprocessing the full dataset before the train/test split can leak information.

## Week 8 - Decision trees and random forests

### Learn

- tree splits
- impurity intuition
- depth
- leaf size
- overfitting in trees
- decision trees
- random forests
- bagging intuition
- feature importance limitations

### Mini-project 8 - Tree vs Logistic Regression

Use the same dataset and compare:

- logistic regression
- decision tree
- random forest

Record:

- cross-validation result
- validation PR-AUC / Average Precision
- inference time
- signs of overfitting

Do not choose the winner only from training score.

### Evaluation gate

Explain why a deep decision tree can memorize training data and why random forests reduce variance.

## Week 9 - Gradient boosting, imbalance, calibration, decision thresholds

### Learn

- boosting intuition
- gradient boosting at a conceptual level
- XGBoost or LightGBM
- class imbalance
- class weighting
- downsampling for training vs preserving natural prevalence for evaluation
- oversampling / SMOTE concept and leakage risk
- probability calibration intuition
- decision threshold vs model training
- cost-sensitive evaluation

### Resources

- scikit-learn ensemble documentation
- [LightGBM Python introduction](https://lightgbm.readthedocs.io/en/stable/Python-Intro.html) or XGBoost documentation

Use **one** boosting library first. You do not need both.

### Mini-project 9 - Threshold and Review-Capacity Simulator

Train a boosted tree model and simulate an operations team that can review only a limited number of alerts per day.

For several thresholds, calculate:

- number of alerts
- precision
- recall
- false positives
- fraud cases caught

This teaches you that model selection and business decision policy are different problems.

### Evaluation gate

You can explain why:

- resampling the test set gives misleading real-world metrics
- class weights affect training but do not magically choose the right production threshold
- the best threshold depends on business cost/capacity

# Phase 4 - Fraud specialization with PaySim

## Week 10 - PaySim: domain understanding and EDA

### Dataset

Use the [PaySim synthetic mobile-money dataset](https://www.kaggle.com/ealaxi/paysim1/metadata).

PaySim is especially relevant to Kori because it simulates mobile-money transaction types such as CASH-IN, CASH-OUT, PAYMENT, and TRANSFER.

### Critical warning

The dataset documentation warns that detected fraudulent transactions are canceled, so the post/balance columns can leak simulator behavior. Treat the warning as a feature-availability and leakage exercise; do not blindly copy common Kaggle notebooks.

### Learn / investigate

- dataset schema
- class prevalence
- transaction types
- fraud distribution by type
- fraud distribution over time
- amount distributions
- sender/receiver identity patterns
- whether each column is available at prediction time
- whether any field encodes simulator-specific or post-outcome information

### Mini-project 10 - PaySim EDA Report

Create `docs/paysim-eda.md` with:

- dataset summary
- class imbalance
- visualizations
- suspected leakage fields
- candidate production-safe features
- limitations of synthetic data
- differences between PaySim and Kori

### Evaluation gate

You should be able to answer:

> Why can a model perform brilliantly on PaySim and still fail on real MFS data?

## Week 11 - Fraud feature engineering

### Learn feature families

**Transaction features**

- amount
- type
- hour / day
- amount relative to wallet balance if legitimately available before execution

**Velocity features**

- transaction count last 5m / 1h / 24h
- amount sum last 1h / 24h
- cash-out count
- failed-attempt count where applicable

**Behavioral features**

- user's average and median amount
- amount-to-baseline ratio
- time since previous transaction
- unusual hour

**Counterparty features**

- new counterparty
- previous transaction count with counterparty
- unique counterparties 24h
- fan-in / fan-out counts later

**Account/device features**

- account age
- KYC state where appropriate
- known-device flag
- device age / first seen

Do not call a client-provided device ID a secure hardware fingerprint.

### Mini-project 11 - Feature Engineering Package

Build a reusable package rather than one notebook:

```text
ml-risk/
  src/kori_risk/
    features/
      transaction.py
      velocity.py
      behavior.py
      counterparty.py
```

Write unit tests for feature functions.

### Evaluation gate

For each feature document:

- definition
- data source
- calculation window
- prediction-time availability
- missing-data behavior
- leakage risk

## Week 12 - Fraud model benchmark and defensible evaluation

### Models

Compare at least:

1. dummy baseline
2. logistic regression
3. random forest
4. gradient boosting / LightGBM / XGBoost

### Split strategy

Use a chronological test strategy for the main report. One reasonable experiment is:

- first 70% of time -> training
- next 15% -> validation
- final 15% -> test

The exact percentages can change, but the test set must remain untouched until final evaluation.

You may compare against a random stratified split to demonstrate how evaluation methodology changes the reported result.

### Report these metrics

Primary:

- Average Precision / PR-AUC

Secondary:

- precision
- recall
- F1
- ROC-AUC
- confusion matrix
- alerts per 1,000 transactions at chosen threshold
- inference latency distribution for the final model

If you downsample legitimate transactions for faster training, do **not** report final metrics on a rebalanced/downsampled test set. Evaluate on a held-out set with realistic prevalence.

### Mini-project 12 - Model Comparison Report

Create:

```text
reports/model-benchmark.md
```

For every model include:

- feature set
- hyperparameters
- train/validation/test methodology
- metrics
- runtime
- limitations
- decision about whether to keep or reject the model

### Evaluation gate

You should be able to defend your model choice without saying "because it had the highest accuracy."

# Phase 5 - Explainability and anomaly detection

## Week 13 - Explainable ML with SHAP

### Learn

- global vs local explanation
- feature attribution
- Shapley value intuition
- limitations of feature-attribution explanations
- correlated-feature caveats
- Tree SHAP for tree models

### Resource

[SHAP TreeExplainer documentation](https://shap.readthedocs.io/en/stable/generated/shap.TreeExplainer.html)

### Mini-project 13 - Fraud Explanation Report

For 20 example predictions produce:

- risk score
- true label
- top positive contributors
- top negative contributors
- short human-readable reason codes

Do not expose raw SHAP numbers directly as user-facing business explanations. Translate them into controlled reason codes.

### Evaluation gate

Explain the difference between:

> "This feature contributed strongly to this model prediction"

and

> "This feature caused the fraud."

The second statement is not justified by SHAP alone.

## Week 14 - Anomaly detection

### Learn

- supervised fraud detection vs anomaly detection
- novelty vs outlier detection concept
- Isolation Forest
- Local Outlier Factor conceptually
- anomaly score
- contamination assumption
- evaluating anomaly models when labels exist

### Mini-project 14 - Behavioral Anomaly Prototype

Train Isolation Forest on user-behavior features and compare its anomaly score with supervised fraud probability.

Inspect cases where:

- supervised model high, anomaly low
- supervised low, anomaly high
- both high
- both low

Do not combine the scores into production policy yet. First understand the disagreements.

### Evaluation gate

Explain why "unusual" does not mean "fraudulent."

# Phase 6 - Model serving and Kori integration

## Week 15 - FastAPI model service

### Learn

- FastAPI basics
- Pydantic request/response schemas
- startup/lifespan model loading
- dependency boundaries
- validation
- structured errors
- health/readiness endpoints
- logging
- async vs sync inference considerations
- pytest for API tests

### Primary resource

[FastAPI Tutorial - official](https://fastapi.tiangolo.com/tutorial/)

### Mini-project 15 - Kori Risk Service

Create:

```text
ml-risk/
  src/kori_risk/
    api/
      main.py
      schemas.py
    features/
    models/
    evaluation/
  tests/
  artifacts/
```

Endpoints:

```text
GET  /health
GET  /model/info
POST /v1/risk/predict
```

The model should load once at startup rather than on every request.

### Evaluation gate

Test:

- valid request
- invalid feature type
- missing field
- model unavailable
- prediction response schema
- repeated deterministic request

## Week 16 - Kori risk domain and deterministic rules

This is where the streams begin to merge.

### Design the NestJS domain first

Suggested concepts:

```text
RiskAssessment
RiskSignal
RiskDecision
RiskCase
RiskModelVersion
```

### Build deterministic rules before ML enforcement

Examples:

- high transaction velocity
- unusual amount compared with account baseline
- new counterparty
- first-seen device identifier
- rapid receive-then-cash-out pattern

Rules should create explicit reason codes such as:

```text
VELOCITY_5M_HIGH
AMOUNT_OUTLIER
NEW_COUNTERPARTY
NEW_DEVICE
RAPID_CASHOUT
```

### Mini-project 16 - Hybrid Risk Decision Prototype

Produce a risk assessment from:

```text
rules + ML prediction + metadata
```

but do not block transactions yet.

Persist enough data to audit the prediction later:

- transaction/request reference
- model version
- feature schema version
- risk score
- rule hits
- reason codes
- timestamp

### Evaluation gate

You can explain why the ML model is not allowed to directly write ledger/balance state.

## Week 17 - Shadow mode and online features

### Shadow mode behavior

```text
transaction request
      |
      +--> risk prediction
      |      |
      |      +--> persist assessment
      |
      +--> normal Kori transaction path
```

The risk result does not alter the financial outcome yet.

### Learn

- inference timeouts
- fallback behavior
- service failure isolation
- online vs offline features
- training-serving skew
- rolling counters in Redis
- feature freshness

### Redis online feature examples

```text
risk:user:{id}:txn_count:5m
risk:user:{id}:txn_amount:1h
risk:user:{id}:counterparties:24h
```

Choose structures and TTLs deliberately; do not simply create keys for every idea.

### Mini-project 17 - Shadow Integration

NestJS calls FastAPI, records:

- request latency
- risk score
- model version
- rule hits
- errors/timeouts

If risk service is unavailable in shadow mode, normal Kori processing should continue and the failure should be observable.

### Evaluation gate

Run integration tests proving that ML service failure cannot corrupt or partially execute a financial transaction.

# Phase 7 - MLOps and production thinking

## Week 18 - Experiment tracking and model registry

### Learn

- experiment vs model artifact
- parameters
- metrics
- artifacts
- model lineage
- model version
- champion/challenger concept
- reproducibility

### Resource

[MLflow Model Registry](https://www.mlflow.org/docs/latest/model-registry/)

### Mini-project 18 - MLflow Experiment History

Track at least:

- logistic regression baseline
- random forest
- boosted tree candidate
- feature-set version
- threshold experiment

Register the chosen model and attach:

- model version
- training data/version note
- evaluation metrics
- feature schema version

### Evaluation gate

Given a saved Kori risk assessment, you should be able to answer:

> Which model version produced this score, and which training experiment produced that model?

## Week 19 - Monitoring, drift, and human feedback

### Learn

**Service metrics**

- inference latency
- error rate
- timeout rate
- request volume

**Model-input metrics**

- missing feature rate
- feature distribution shifts
- unseen categories

**Prediction metrics**

- score distribution
- risk-band distribution
- alert volume

**Delayed quality metrics**

- precision
- recall
- false positive rate
- confirmed fraud rate

**Concepts**

- data drift
- concept drift
- feedback loops
- delayed labels

Google's Production ML Systems material is useful here: [Production ML Systems](https://developers.google.com/machine-learning/crash-course/production-ml-systems)

### Mini-project 19 - Risk Review Feedback Loop

Design an admin/risk-review workflow:

```text
PENDING_REVIEW
CONFIRMED_FRAUD
LEGITIMATE
FALSE_POSITIVE
```

Store review outcome separately from prediction.

Create a script/report that compares model predictions with reviewed outcomes.

### Evaluation gate

Explain why retraining directly on model-generated decisions can create a feedback loop.

# Phase 8 - Deep learning foundation and portfolio hardening

## Week 20 - PyTorch basics, not forced deep learning

Your first Kori fraud model does not need a neural network. Learn PyTorch now to broaden your ML foundation, not to replace a working tree model.

### Learn

- tensors
- Dataset and DataLoader
- neural network modules
- activation functions
- loss functions
- autograd
- optimizer
- training loop
- validation loop
- saving/loading model weights

### Primary resource

[PyTorch Learn the Basics](https://docs.pytorch.org/tutorials/beginner/basics/)

### Mini-project 20 - Small Neural Network Classifier

Use a standard educational dataset or a simplified transaction dataset.

Write the training loop yourself. Track:

- training loss
- validation loss
- overfitting
- final evaluation

The goal is understanding the workflow, not beating the Kori boosted-tree model.

### Evaluation gate

Explain:

- forward pass
- loss
- gradient
- backpropagation
- optimizer step
- epoch
- batch
- why validation data is not used for gradient updates

# Monthly Kori + AI integration plan

## Month 1 - Foundations, no AI inside Kori

### AI/ML

- Python
- NumPy
- pandas
- Matplotlib
- statistics and linear algebra intuition

### Kori

Focus on financial correctness and tests. Do not expand product scope for ML yet.

### Exit condition

You can manipulate transaction data fluently in Python and Kori's critical correctness fixes are progressing.

## Month 2 - Core ML while Kori architecture matures

### AI/ML

- problem framing
- leakage
- classification
- metrics
- pipelines
- cross-validation
- trees
- ensembles
- imbalance

### Kori

- posting-plan/executor architecture
- real PostgreSQL integration/concurrency tests
- idempotency tests
- deployment foundation

### Exit condition

You can build and defend a complete classification experiment independently.

## Month 3 - Fraud specialization

### AI/ML

- PaySim EDA
- feature engineering
- fraud baselines
- boosted model
- chronological evaluation

### Kori

Design the risk domain and data/event contract, but keep the ML service outside the financial decision path.

### Exit condition

You have a defensible fraud-model benchmark report.

## Month 4 - Serving and explainability

### AI/ML

- SHAP
- anomaly detection
- FastAPI

### Kori

- deterministic rules
- RiskAssessment persistence
- ML service integration
- shadow mode

### Exit condition

A Kori transaction can generate an auditable risk assessment without affecting transaction correctness.

## Month 5 - MLOps and portfolio quality

### AI/ML

- MLflow
- model registry
- monitoring
- drift concepts
- PyTorch foundation

### Kori

- online features where justified
- review workflow
- monitoring
- deployment
- documentation

### Exit condition

You can demonstrate the full lifecycle: data -> training -> evaluation -> registry -> inference -> Kori shadow prediction -> review/monitoring.

# Capstone design - Kori Fraud/Risk Engine

## Stage A - deterministic rules

Build explicit rules first. They are easy to test, auditable, and provide immediate value.

Suggested signals:

- transaction velocity
- unusual amount relative to history
- new counterparty
- unusual transaction hour
- first-seen device identifier
- rapid cash-out after receiving money
- repeated failed attempts where Kori captures them reliably

## Stage B - supervised model

Inputs should contain only prediction-time-safe fields.

Start with:

- logistic regression baseline
- random forest
- boosted tree model

Do not use deep learning just to make the project sound like AI.

## Stage C - anomaly model

Use Isolation Forest as an additional signal for unusual behavior. Keep supervised fraud probability and anomaly score conceptually separate at first.

## Stage D - policy layer

The policy layer should be deterministic. Example conceptually:

```text
LOW    -> allow
MEDIUM -> allow + monitor or step-up
HIGH   -> review / controlled block policy later
```

Do not activate blocking until you have a deliberately designed policy, test coverage, and evaluation against false-positive cost.

## Stage E - analyst feedback

Human review creates better labels. Store:

- prediction
- model version
- explanation/reason codes
- analyst outcome
- review timestamp

Never overwrite historical predictions when a reviewer changes the label.

# Suggested repository layout when ML work begins

Do not restructure Kori today only for this roadmap. Use this once the risk service becomes real.

```text
Kori/
  backend/                    # Existing NestJS core
  ml-risk/
    pyproject.toml
    src/kori_risk/
      api/
      data/
      features/
      models/
      evaluation/
      explainability/
    notebooks/                # Exploration only
    tests/
    artifacts/                # Local/dev model artifacts; manage carefully
    reports/
  docs/
    risk/
      problem-framing.md
      feature-catalog.md
      model-card.md
      evaluation-report.md
      integration-contract.md
```

Keep reusable feature/model logic in Python modules rather than burying everything in notebooks.

# The mini-project portfolio in order

By the end, you should have completed these small projects/labs:

1. Transaction Log Analyzer CLI
2. Typed Transaction Domain Package
3. Vectorized Risk Feature Calculator
4. Behavioral Transaction EDA
5. Leakage Detective
6. Fraud Metrics Lab
7. Reproducible Preprocessing Pipeline
8. Tree vs Logistic Regression Benchmark
9. Threshold and Review-Capacity Simulator
10. PaySim EDA Report
11. Fraud Feature Engineering Package
12. Fraud Model Comparison Report
13. SHAP Explanation Report
14. Behavioral Anomaly Prototype
15. FastAPI Risk Service
16. Hybrid Rules + ML Risk Assessment
17. Kori Shadow-Mode Integration
18. MLflow Experiment and Model Registry
19. Risk Review / Monitoring Feedback Loop
20. PyTorch Neural-Network Fundamentals Lab

These are not twenty portfolio repositories. Most belong in one `ml-risk` learning/capstone workspace. Your public story should remain coherent.

# How to evaluate yourself at major gates

## Gate 1 - Python/data competence

You pass when you can, without AI-generated implementation:

- load and validate transaction data
- manipulate it with pandas
- compute rolling windows
- visualize distributions
- write typed functions and tests
- explain vectorization

## Gate 2 - ML fundamentals

You pass when you can answer and demonstrate:

- what the target is
- what each feature means
- how train/validation/test differ
- what leakage is
- what overfitting looks like
- why cross-validation is useful
- why precision/recall matter in fraud
- how changing threshold changes business behavior

## Gate 3 - fraud modeling competence

You pass when you can:

- audit PaySim fields for leakage
- use a chronological evaluation
- establish a dummy baseline
- compare multiple models fairly
- handle class imbalance without contaminating the test set
- choose metrics appropriate to rare fraud
- explain limitations of synthetic data

## Gate 4 - ML engineering competence

You pass when you can:

- package feature logic outside notebooks
- serve a model through FastAPI
- validate API inputs
- load a model once
- version model and feature schema
- test failures/timeouts
- integrate in shadow mode without risking financial correctness

## Gate 5 - MLOps/portfolio competence

You pass when another developer can clone the repository and understand:

- what problem you solved
- where the data came from
- how you prevented leakage
- how the model was evaluated
- what the chosen threshold means
- how the model is versioned
- how inference is monitored
- what happens if the ML service fails
- what the model cannot claim

# Model evaluation checklist for the final Kori fraud model

Before publishing results, confirm all of these.

## Data

- [ ] Dataset source and license documented
- [ ] Fraud prevalence documented
- [ ] Synthetic-data limitations documented
- [ ] Prediction-time feature availability checked
- [ ] Suspected leakage columns excluded or explicitly justified
- [ ] Missing values handled reproducibly

## Splitting

- [ ] Test set held out
- [ ] Main evaluation uses a production-relevant chronological split
- [ ] Any cross-validation occurs only inside training/development data
- [ ] Resampling is not applied to validation/test data

## Baselines

- [ ] Dummy baseline recorded
- [ ] Logistic-regression baseline recorded
- [ ] Final model beats baseline on relevant metrics

## Metrics

- [ ] PR-AUC / Average Precision
- [ ] Precision
- [ ] Recall
- [ ] F1
- [ ] ROC-AUC (secondary, not the only metric)
- [ ] Confusion matrix
- [ ] Alert volume at chosen threshold
- [ ] False positives per 1,000 transactions

## Reliability

- [ ] Random seeds/config recorded where relevant
- [ ] Feature pipeline is reusable
- [ ] Model artifact is versioned
- [ ] Inference latency measured
- [ ] API errors tested
- [ ] Risk-service outage behavior defined

## Explainability

- [ ] Global feature behavior inspected
- [ ] Local explanations tested
- [ ] Business reason codes controlled by application logic
- [ ] No causal claim is made from feature attribution alone

# What not to learn yet

For the first 4-5 months, intentionally postpone:

- TensorFlow if you are already choosing PyTorch later
- Django
- Flask as a second serving framework
- LangChain/LangGraph
- LLM fine-tuning
- reinforcement learning
- Kubernetes
- Spark
- Airflow
- Kafka unless a concrete Kori need appears
- graph neural networks
- computer-vision detours
- advanced distributed training

These may be useful later, but learning them now would dilute the path.

# Optional next stage after this roadmap

Only after the fraud system and Kori v1 are credible, choose one advanced direction.

## Option A - Graph fraud / mule detection

Learn:

- transaction graph construction
- NetworkX
- degree / in-degree / out-degree
- connected components
- cycles
- fan-in / fan-out
- PageRank
- community concepts

Later, if justified:

- PyTorch Geometric
- graph neural networks

## Option B - Agent liquidity forecasting

Learn:

- time-series decomposition intuition
- lag features
- rolling features
- forecasting baselines
- MAE/RMSE/MAPE limitations
- tree-based forecasting or dedicated time-series models

Use the model to forecast cash-in/cash-out demand for agents.

## Option C - Risk analyst assistant (LLM)

Only after structured risk data exists.

Use tool calling/RAG so an authorized analyst can ask questions such as:

- Why was this transaction flagged?
- What rule signals fired?
- What was the model version?
- What unusual behavior occurred in the last seven days?

The LLM should retrieve structured Kori data through authorized tools. It should never be the authority that changes balances or ledger entries.

# Learning-resource map

Use primary/official material as the default. Do not stack multiple full courses covering the same thing.

| Topic | Primary resource | Use it for |
|---|---|---|
| Python | [Python Tutorial](https://docs.python.org/3/tutorial/index.html) | Fast language transition for an experienced programmer |
| NumPy | [NumPy Quickstart](https://numpy.org/doc/stable/user/quickstart) | Arrays, broadcasting, vectorization |
| pandas | [pandas Getting Started](https://pandas.pydata.org/docs/getting_started/) | Tabular data and time series manipulation |
| Visualization | [Matplotlib Tutorials](https://matplotlib.org/stable/tutorials/index) | EDA plots |
| ML fundamentals | [Inria scikit-learn MOOC](https://inria.github.io/scikit-learn-mooc/) | Predictive modeling, preprocessing, validation, failure modes |
| ML concepts | [Google ML Crash Course](https://developers.google.com/machine-learning/crash-course) | Intuition, exercises, overfitting, classification, production ML |
| Deeper statistical learning | [ISLP](https://www.statlearning.com/) | Optional deeper reading and Python labs |
| Fraud dataset | [PaySim dataset](https://www.kaggle.com/ealaxi/paysim1/metadata) | Mobile-money fraud experiments |
| PaySim origin | [PaySim project](https://github.com/EdgarLopezPhD/PaySim) | Simulator context and original references |
| Precision/Recall | [scikit-learn Precision-Recall](https://scikit-learn.org/stable/auto_examples/model_selection/plot_precision_recall.html) | Rare-class evaluation |
| Boosting | [LightGBM Python Intro](https://lightgbm.readthedocs.io/en/stable/Python-Intro.html) | One practical boosted-tree implementation |
| Explainability | [SHAP TreeExplainer](https://shap.readthedocs.io/en/stable/generated/shap.TreeExplainer.html) | Tree-model feature attribution |
| Model API | [FastAPI Tutorial](https://fastapi.tiangolo.com/tutorial/) | Serving inference as a service |
| MLOps | [MLflow Model Registry](https://www.mlflow.org/docs/latest/model-registry/) | Tracking/versioning/model lifecycle |
| Deep learning | [PyTorch Learn the Basics](https://docs.pytorch.org/tutorials/beginner/basics/) | Tensors, autograd, training loops |

# Suggested weekly review template

At the end of every week, create a short entry:

```markdown
# Week N Review

## What I learned
- ...

## What I implemented myself
- ...

## What I still cannot explain clearly
- ...

## Mistakes / failure modes I observed
- ...

## How this relates to Kori
- ...

## Evaluation score
Explain:   _ / 2
Implement: _ / 2
Diagnose:  _ / 2
Apply:     _ / 2
Total:     _ / 8

## Next week's prerequisite gaps
- ...
```

# Final portfolio deliverables

When the roadmap is complete, Kori should have a coherent engineering narrative, not a pile of buzzwords.

Aim to publish:

1. **Kori architecture README** - financial core and safety boundary.
2. **Fraud problem-framing document** - target, prediction point, costs, constraints.
3. **Feature catalog** - definitions, windows, source, availability, leakage notes.
4. **EDA report** - PaySim and data limitations.
5. **Model benchmark** - baselines, splits, metrics, thresholds, limitations.
6. **Model card** - chosen model, intended use, non-intended use, known limitations.
7. **FastAPI inference service** - tested API.
8. **Shadow-mode integration** - NestJS calls risk service without giving it financial authority.
9. **MLflow history/model versioning** - reproducibility.
10. **Monitoring/review flow** - model outputs can be reviewed and later used as labels.
11. **Automated tests** - feature logic, API behavior, and integration failure modes.
12. **Demo script** - reproducible examples of normal and suspicious transaction patterns.

# Resume-ready claim only after the work is proven

Do not write this now. Earn it first.

A future defensible project bullet could look like:

> Built a hybrid transaction-risk system for a NestJS MFS backend using rule-based velocity signals and a Python fraud-classification service; engineered behavioral features, evaluated imbalanced models with chronological holdouts and precision-recall metrics, served versioned inference through FastAPI, and integrated predictions in shadow mode with auditable reason codes.

Every phrase in that bullet should correspond to code, tests, an evaluation report, or a reproducible experiment in the repository.

# Final principle

Your goal is not to become someone who can call `model.fit()` or an LLM API.

Your goal is to be able to reason through the complete system:

```text
What exactly are we predicting?
        ↓
What information exists at prediction time?
        ↓
How is the dataset constructed?
        ↓
Can anything leak the answer?
        ↓
What baseline should we beat?
        ↓
Which metric matches the business cost?
        ↓
Why did the model make this prediction?
        ↓
How is it served and versioned?
        ↓
What happens when it is unavailable?
        ↓
How do we monitor degradation?
        ↓
How do human review labels improve the next model?
```

If you can answer those questions and demonstrate them in Kori, you will have built a credible bridge from backend engineering into applied ML engineering without throwing away the backend skills you already invested in.

# Resource verification notes

The learning links in this document were checked in September 2026. The official Python tutorial describes itself as intended for programmers new to Python; the Inria scikit-learn MOOC remains a self-paced, continuously updated course; Google ML Crash Course includes classification, overfitting, datasets, neural networks, and production ML modules; FastAPI's official tutorial remains the recommended progressive guide; MLflow Model Registry documents versioning, aliases, lineage, and lifecycle management; and current PyTorch beginner material covers tensors through complete training workflows.

The PaySim dataset is synthetic. Its public metadata describes it as generated from aggregated mobile-money behavior and explicitly warns against blindly using several balance fields for fraud detection because detected fraudulent transactions are canceled in the simulation. Treat PaySim as a learning/benchmark dataset, not evidence that your model will generalize to real bKash/Nagad transaction data.
