# Warrant Studio — 3-Minute Canonical Demo Presentation Script

**Target Video Duration:** 180 seconds (3:00)  
**Themes:** Dual-Theme Design System — Dark Mode (Midnight Navy + Emerald `#0B1220` / `#10B981`) & Light Mode (Forest Green + Warm Ivory `#F7F5EF` / `#12372A`)  
**Audience:** Hackathon Judges, Enterprise Security Architects, Fintech Engineers  

---

## Timeline & Scene Breakdown

### Scene 1: Problem & Intent Compilation (0:00 – 0:35)
- **Workstation:** `Mandate Compiler` (`http://localhost:5173/?workstation=mandate`)
- **Visual Reference:** [`docs/screenshots/dual-theme/02_dark_mandate_compiler_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/02_dark_mandate_compiler_desktop_1440x900.png)
- **Visual Action:** 
  - Show the dark Midnight Navy + Emerald interface (and toggle to Forest Green + Warm Ivory light mode).
  - Review natural language mandate: *"Authorize autonomous procurement for dev tools with a $500 per-item cap and $750 max total."*
  - Click **Compile Intent**. Show the deterministic AST output and canonical RFC 8785 policy hash.
- **Narrator Voiceover:**
  > *"Autonomous shopping and procurement agents are transacting at machine speed. But when an agent has direct payment credentials, it can easily overspend or bypass human guardrails. Warrant Studio sits as an authoritative policy gate between autonomous agents and payment settlement. Here in the Mandate Compiler, high-level intent is compiled into finite mathematical constraints with an immutable cryptographic hash."*

---

### Scene 2: Verification Studio & Decision D-014 Fail-Closed Block (0:35 – 1:15)
- **Workstation:** `Verification Studio` & `System Dashboard` (`?workstation=verification` $\to$ `?workstation=overview`)
- **Visual Reference:** [`docs/screenshots/dual-theme/04_dark_verification_studio_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/04_dark_verification_studio_desktop_1440x900.png) & [`docs/screenshots/dual-theme/01_dark_dashboard_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/01_dark_dashboard_desktop_1440x900.png) & [`docs/screenshots/dual-theme/05_dark_findings_witnesses_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/05_dark_findings_witnesses_desktop_1440x900.png)
- **Visual Action:**
  - Launch bounded search verification against 500 permutations.
  - Discovery: A counterexample is found where an enterprise seat ($650.00) slips past a weak condition.
  - Navigate to **System Dashboard**: Point to the prominent amber **Decision D-014 Warning box**.
  - Show that attempting to issue an approval fails closed: *"Risk acceptance is prohibited for CRITICAL and HIGH severity findings."*
- **Narrator Voiceover:**
  > *"Before any policy goes live, Warrant Studio's Verification Studio tests the candidate policy against adversarial scenarios. Here, it discovers a critical loophole where a single-seat enterprise tier at $650 exceeds our $500 cap. Under Warrant's architectural Decision D-014, critical findings cannot be waived or accepted as risk. The system fails closed, locking out checkout approval until a repaired policy is verified."*

---

### Scene 3: Policy Repair & Cryptographic Approval (1:15 – 1:50)
- **Workstation:** `Policy Versions` & `Approval Checkpoints` (`?workstation=policy-versions` $\to$ `?workstation=approval`)
- **Visual Reference:** [`docs/screenshots/dual-theme/03_dark_policy_versions_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/03_dark_policy_versions_desktop_1440x900.png) & [`docs/screenshots/dual-theme/06_dark_approval_checkpoints_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/06_dark_approval_checkpoints_desktop_1440x900.png)
- **Visual Action:**
  - Review Policy Version 2 with patched condition.
  - Re-run verification: All 500 candidate permutations safe.
  - Establish Governance Approval: Set $1,500.00 spend ceiling with single-use checkout nonce.
- **Narrator Voiceover:**
  > *"We review Policy Version 2, which patches the threshold. Re-running the verification confirms 100% compliance across all permutations. With proof in hand, the operator establishes a cryptographic Governance Approval with a lifetime spend limit of $1,500, issuing a time-bounded, single-use checkout nonce."*

---

### Scene 4: Checkout Gate & Authoritative PayPal Sandbox Capture (1:50 – 2:25)
- **Workstation:** `Checkout Gate` & `Transactions` (`?workstation=checkout` $\to$ `?workstation=transactions`)
- **Visual Reference:** [`docs/screenshots/dual-theme/07_dark_checkout_gate_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/07_dark_checkout_gate_desktop_1440x900.png) & [`docs/screenshots/dual-theme/08_dark_transactions_ledger_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/08_dark_transactions_ledger_desktop_1440x900.png)
- **Visual Action:**
  - Shopping agent submits checkout cart ($240.00 API Credits) using the single-use nonce.
  - Authorization evaluates to `ALLOW`. Spend reservation ($240.00) is locked against the approval budget.
  - Order executes via PayPal Sandbox: Show live PayPal Order ID and capture confirmation.
  - Show instantaneous nonce consumption (preventing replay attacks).
- **Narrator Voiceover:**
  > *"When the autonomous agent reaches checkout, it presents its cart and the single-use nonce to Warrant's Checkout Gate. Warrant deterministically validates the cart against the active approval. The moment it passes, spend is reserved and the order is authorized via PayPal Sandbox Orders API with strict idempotency keys. Browser redirects are never treated as proof of payment—only authoritative server-side capture confirms settlement."*

---

### Scene 5: Ledger, Reconciliation & Evaluation Audit Report (2:25 – 3:00)
- **Workstation:** `Evaluation Report` (`?workstation=evaluation`)
- **Visual Reference:** [`docs/screenshots/dual-theme/09_dark_evaluation_report_desktop_1440x900.png`](file:///d:/PayPal/docs/screenshots/dual-theme/09_evaluation_report_desktop_1440x900.png), [`docs/screenshots/dual-theme/14_dark_mobile_dashboard_375x667.png`](file:///d:/PayPal/docs/screenshots/dual-theme/14_dark_mobile_dashboard_375x667.png), [`docs/screenshots/dual-theme/15_dark_mobile_navbar_drawer_375x667.png`](file:///d:/PayPal/docs/screenshots/dual-theme/15_dark_mobile_navbar_drawer_375x667.png)
