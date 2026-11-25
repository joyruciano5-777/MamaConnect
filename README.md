# MamaConnect

**A maternal-health referral workflow prototype**

MamaConnect is a prototype for community health workers (CHWs), health facilities, and district health teams. It explores how structured maternal assessments, referral tracking, and facility commodity information can be represented in a shared workflow.

**Status:** Working prototype. It has not been clinically validated or deployed for real patient care.

**Hosted prototype:** https://mamaconnect-4vvr6g.v2.appdeploy.ai/

## Intended users

- **CHWs:** record maternal assessments and generate referral alerts from selected symptoms and measurements.
- **Facility staff:** view incoming referrals, acknowledge them, record arrival, and update commodity stock.
- **District teams:** monitor referrals and reassign facilities.

## Main functions represented in the source

- Role-based CHW, facility, and district workflows.
- Rule-based maternal risk classification.
- Referral creation, acknowledgement, arrival tracking, and reassignment.
- Facility commodity stock records and readiness indicators.
- Facility map and district oversight views.
- Backend notifications and real-time update subscriptions.

## AI training dataset

A separate prompt-response dataset was developed for maternal-health-related AI training and evaluation. Its stated coverage includes pregnancy symptoms, CHW guidance, and facility and district scenarios. The pairs were reviewed against WHO guidance and peer-reviewed sources.

The dataset itself is not included in this source archive. A CSV schema template is provided at `dataset/mamaconnect_training_sample.csv`. Replace the header-only template with genuine prompt-response examples before presenting it as a dataset sample. Do not invent entries or publish personal health information, confidential material, or restricted content.

Recommended fields:

- `pair_id`: unique identifier.
- `category`: scenario category.
- `prompt`: original task or question.
- `reference_response`: expected response.
- `source_title` and `source_url`: supporting reference.
- `evaluation_criteria`: criteria used to judge an answer.
- `review_status`: actual review status.

## Risk classification implementation

The function `computeRisk()` in `backend/risk.ts` applies explicit conditions; it is **rule-based logic, not a trained AI or machine-learning model**. In the current implementation, bleeding, convulsions, or systolic blood pressure at least 160 or diastolic blood pressure at least 110 trigger the `emergency` category. Two or more moderate flags trigger `high`; one moderate flag triggers `moderate`; otherwise the result is `low`. A non-empty unclassified symptom changes an otherwise low result to moderate and flags it for review.

The moderate flags coded are systolic blood pressure at least 140 or diastolic at least 90, severe headache, fever, reduced fetal movement, and prolonged labour. These are the conditions currently encoded in the prototype; their inclusion does not establish clinical validation.

## Tests

`tests/tests.txt` contains five documented test scenarios covering CHW assessment and referral, facility acknowledgement and arrival, commodity stock updates, district reassignment, and role-based navigation. These are test instructions, not evidence that the tests have been independently executed or passed.

## Technical implementation

The source uses React 19, TypeScript, Vite, Recharts, and Lucide React. The backend imports AppDeploy-managed SDK services for routing, authentication, database access, notifications, and real-time functionality.

## Running the project

This project was developed on AppDeploy and depends on AppDeploy-managed services. The supplied `package.json` includes Vite development and build scripts, but it does not declare the imported `@appdeploy/client` and `@appdeploy/sdk` packages. A standalone local setup therefore requires the appropriate AppDeploy SDK packages and service configuration; `npm install` alone should not be assumed to produce a working local deployment.

## Limitations

- Prototype only; not clinically validated.
- Rule-based risk classification has not been validated against patient outcomes.
- The prototype must not be used to diagnose, triage, or make real patient-care decisions.
- Facility and commodity data should be treated as prototype data unless independently verified.
- The source repository does not establish integration with a live DHIS2 instance or a live USSD service.

## Author

**Joy Ruciano**  
AI Training | Research | Project and Community Development  
Kenya

[Portfolio](https://joyruciano-aitraining-portofolio.netlify.app/)

## License

MIT
