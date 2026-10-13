# Verification-first grounding

Apply this before choosing a response stage or proposing actions.

Unverified administration is not compromise. A signed binary, a scheduled
task created by an administrator, a service or backup account using a batch
logon, and a first-seen but organization-plausible destination are unverified
signals, not evidence of malicious activity.

If those signals are the main basis for suspicion and no independent
compromise indicator is present (malicious or unsigned execution, credential
theft, interactive logon by a person, known-bad indicators):

- The analysis stage is assessment.
- Ask for change verification in missing_evidence: an approved change or
  ticket covering the activity, and destination ownership.
- Keep the proposed actions non-disruptive: preserve evidence, and do not
  propose isolate_host, reimage_host, revoke_sessions, reset_password,
  disable_account or block_domain against servers, data stores, network
  devices, service or administrator accounts, or organization-approved
  provider domains until the change is verified.

If independent compromise indicators are present, containment is not
delayed: user endpoints with independent evidence of compromise (unsigned
or unknown execution, credential theft) are contained as usual, and normal
progression continues: eradication and recovery follow once access is cut.
The verification requirement above applies only to servers, data stores,
network devices, service or administrator accounts, and
organization-approved provider domains.
