## Project Timeline
### Key Dates

| To-do's | Date | Activities | Status |
| --- | ---- | --- | ---|
| **Track and Problem Statement Selection** | By 21/09 | Review problem statement selection from Track 1: Agentic Cyber Defense | Pending |
| **Pre-mentor ideas refinement** | 22/09 - 25/09 | Refine the shortlisted ideas, identify technical requirements and prepare questions for the mentor | Pending |
| **Mentor Consultation** | 26/09 | Present the proposed direction, obtain feedback and challenge the project scope | Pending |
| **Scope and Planning** | 27/09 – 29/09 | Finalize the problem statement, target users, MVP, agent workflow, architecture, dataset, safeguards and success metrics | Pending |
| **Core Prototype Development** | 30/09 – 4/10 | Build the main evidence-processing, agent reasoning, planning and user-interface components | Pending |
| **Integration and Evaluation** | 5/10 – 7/10 | Integrate components, test the main scenario, evaluate outputs and resolve critical issues | Pending |
| **Internal Feature Freeze** | 8/10 | Complete the core functionality and prepare the first full submission candidate | Pending |
| **Finalization Buffer** | 9/10 - 14/10 | Conduct final testing, improve usability, complete documentation, record and edit the demo video, verify links and prepare submission files | Pending |
| **Official Submission** | 15/10 | Upload all deliverables early and verify successful submission | Pending |

## Hackathon Requirements

- [ ] **Track Alignment** — Project must clearly fit **Track 1: Agentic Cyber Defense**.
- [ ] **Clear Problem Statement** — Define one specific cybersecurity problem that the project solves. Avoid trying to solve cybersecurity as a whole.
- [ ] **Target User** — Clearly state who uses it, e.g. SOC analyst, security engineer, incident responder, SME security team, etc.
- [ ] **Clear Use Case / Scenario** — Have one strong scenario that can be demonstrated from beginning to end.
- [ ] **Agentic AI Component** — The system should use an AI agent/agents that can **reason, make decisions, plan steps and perform cybersecurity-related tasks**, rather than simply functioning as a chatbot.
- [ ] **Agent Workflow** — Show how information flows through the agents/system: **input → analysis → reasoning → decision → action/recommendation → result**.
- [ ] **Evidence / Security Data Processing** — The prototype needs some cybersecurity evidence or data to analyse, such as logs, alerts, events, threat intelligence, vulnerabilities, simulated incidents, or another dataset appropriate to the chosen problem.
- [ ] **Architecture** — Have a clear technical architecture showing the UI, agents, AI/model layer, tools, data sources and other major components.
- [ ] **Working MVP** — Build the smallest version that proves the idea actually works. It does **not** need production-scale infrastructure.
- [ ] **User Interface** — Provide enough UI for judges to understand and interact with the system during the demo.
- [ ] **Agent Reasoning / Decision Support** — The system should demonstrate why it reached an outcome rather than only outputting an unexplained answer.
- [ ] **Planning / Action Component** — Where applicable, the agent should generate or execute a sequence of defensive steps based on what it detects.
- [ ] **Human Oversight** — High-impact actions should have appropriate controls, such as analyst review/approval instead of unrestricted autonomous execution.
- [ ] **Safeguards** — Define boundaries preventing unsafe, unsupported or inappropriate agent behaviour.
- [ ] **Success Metrics** — Establish measurable criteria for whether the prototype works. These could include detection accuracy, task completion, response time, evidence quality, false positives, analyst effort reduction, etc.
- [ ] **Evaluation / Testing** — Test the system using your main scenario and document whether it produced the intended result.
- [ ] **Failure Handling** — Demonstrate sensible behaviour when information is missing, confidence is low, an agent fails, or a recommendation cannot be verified.
- [ ] **Demo-Ready Prototype** — The main scenario should work reliably enough to demonstrate the complete concept to judges.
- [ ] **Documentation** — Explain the problem, solution, architecture, workflow, setup/use, technologies and limitations clearly.
- [ ] **Demo Video** — Prepare and edit the demo video mentioned in your timeline, showing the problem and the working solution.
- [ ] **Submission Files & Links** — Make sure all required project files, documentation, demo links and other submission links work before submission.
- [ ] **Final Submission** — Complete and verify the submission by **15 October 2026**.

## Security/Testing requirements and constraints

| #      | Requirement from HackAI                                | What it means for our project                                                                                                                                                               |
| ------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1**  | **Only perform authorized testing**                    | Do not attack or test real systems, organisations, users, or AI services unless you have permission. HackAI explicitly says other AIs should only be hacked with permission. ([Hack AI][1]) |
| **2**  | **Testing must remain ethical and lawful**             | Cybersecurity functionality should be demonstrated in a controlled environment rather than against unauthorized real-world targets. ([Hack AI][2])                                          |
| **3**  | **Stay within the authorized scope**                   | Only test the systems/components that the challenge or owner has permitted you to test. ([Hack AI][2])                                                                                      |
| **4**  | **Do not attack infrastructure outside the challenge** | HackAI specifically prohibits attempting to compromise applications, back-end systems, or infrastructure outside the intended game/testing scope. ([Hack AI][2])                            |
| **5**  | **Follow the permitted testing methods**               | When a challenge specifies allowed techniques, stay within them. HackAI's own games currently restrict testing to prompts and natural-language interactions. ([Hack AI][2])                 |
| **6**  | **Do not enter personal information**                  | HackAI explicitly tells users not to put personal information into prompts. ([Hack AI][2])                                                                                                  |
| **7**  | **Avoid sensitive information**                        | The site also tells users to avoid personal or sensitive information because submitted inputs are stored. ([Hack AI][2])                                                                    |
| **8**  | **Report unintended vulnerabilities responsibly**      | If a vulnerability is discovered outside normal challenge gameplay, HackAI asks users to report it rather than exploit it further. ([Hack AI][2])                                           |
| **9**  | **Do not deliberately damage the testing environment** | Their guidance says testing must stay within the supplied rules because breaking the applications can prevent other users from learning from them. ([Hack AI][2])                           |
| **10** | **Respect data-use and privacy rules**                 | HackAI states that interaction data can be retained for research and AI-security evaluation, so participants are responsible for not providing private information. ([Hack AI][2])          |
| **11** | **Use provided data ethically**                        | For research collaborations using HackAI data, the site requires ethical use and adherence to privacy standards. ([Hack AI][2])                                                             |
| **12** | **Attribute HackAI data when used for research**       | Researchers using HackAI-provided datasets are required to identify HackAI as the data source. ([Hack AI][2])                                                                               |

[1]: https://hackai.fi/?utm_source=chatgpt.com "Hack AI – Learn to understand AI, test it, and break it if necessary"
[2]: https://hackai.fi/index.php/data-handling-at-hackai/?utm_source=chatgpt.com "Policies and Guidelines – Hack AI"
