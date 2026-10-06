# Security and Safety

This project is a controlled cybersecurity hackathon prototype.

Only synthetic incident data may be used.

Do not implement functionality that attacks, exploits, scans or modifies
real external systems.

All response execution must use the bounded Python simulator.

AI recommendations are proposals only.

An action may execute only when:

1. the action is in the approved simulator catalogue;
2. the target exists in the current incident state;
3. evidence references exist;
4. the proposal references a valid incident-state version;
5. an analyst approved that exact action version;
6. the incident state has not invalidated that approval;
7. backend validation succeeds.

Never treat AI output as authorization.

All relevant activity must generate audit events.

Keep these concepts separate:

proposed
approved
executed
effective

A completed execution does not automatically mean the response was
effective.

Do not fabricate evidence or evidence IDs.

Final reports may only contain incident facts and action outcomes
supported by stored case records.

## Firestore / Firebase Specifics

Firebase service-account credentials must never be committed to Git.

The Firebase Admin (server) SDK runs with privileged access and bypasses
Firestore client Security Rules. The security boundary for this backend is
therefore IAM credentials plus FastAPI authorization and validation. Treat
backend-side validation as mandatory, not optional.

## HackAI Competition Constraints

- Only perform authorized testing. Do not attack or test real systems,
  organisations, users, or external AI services.
- All cybersecurity functionality must be demonstrated in a controlled,
  synthetic environment.
- Do not enter personal or sensitive information into prompts or evidence.
- Stay strictly within the authorized challenge scope.
