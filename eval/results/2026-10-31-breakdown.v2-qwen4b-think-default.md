# AI breakdown evaluation: breakdown.v2

- Date: 2026-10-31
- Model: qwen4b (Ollama 0.40.10)
- Cases: 10, from eval/cases.json. Temperature 0, fixed seed 42, context 4,096, one retry after an invalid answer.
- Cold start, from an unloaded model (not counted below): 4.3 s
- Run with the laptop plugged in so timings can be compared.

## Totals

- Valid output: 10 of 10 (100%)
- Valid on the first try: 10 of 10 (100%)
- Valid only after the retry: 0 of 10 (0%)
- Failed: 0 of 10 (0%)
- Passed the content check (a forbidden word in a step fails it): 1 of 1 checked
- Average steps per valid answer: 6.9
- Average time per case: 27.3 s
- Slowest case: presentation (45.7 s)
- Average manual score: _fill in after scoring (rubric: eval/rubric.md)_

## Cases

| # | Case | Result | Steps | Time | Suggested steps | Score (1-5) | Notes |
|---|---|---|---|---|---|---|---|
| 1 | lab-report | Valid on the first try | 8 | 31.5 s | 1. Write the aim of the experiment (5 min)<br>2. List the apparatus used (5 min)<br>3. Detail the procedure of the experiment (20 min)<br>4. Create the observation table (15 min)<br>5. Plot the graph of T squared against length (20 min)<br>6. Calculate the acceleration due to gravity (g) (15 min)<br>7. Analyze possible errors in the experiment (10 min)<br>8. Write the conclusion of the experiment (10 min) |  |  |
| 2 | exam-revision | Valid on the first try | 7 | 25.8 s | 1. Review exam scope and key concepts (30 min)<br>2. Analyze past papers for patterns and focus areas (20 min)<br>3. Study tree data structures in depth (40 min)<br>4. Learn complexity analysis techniques (30 min)<br>5. Practice tree-related problems and solutions (40 min)<br>6. Review sorting algorithms and their complexities (20 min)<br>7. Create a revision plan and prioritize weak areas (30 min) |  |  |
| 3 | mini-project | Valid on the first try | 9 | 26.6 s | 1. Design database schema for expenses and categories (30 min)<br>2. Create HTML structure for adding and displaying expenses (45 min)<br>3. Style UI with CSS for form and data display (30 min)<br>4. Set up Node.js backend and SQLite database connection (30 min)<br>5. Implement API endpoints for adding and retrieving expenses (30 min)<br>6. Develop pie chart functionality with Chart.js (30 min)<br>7. Integrate chart with backend data and frontend display (30 min)<br>8. Test all features including form validation and data accuracy (30 min)<br>9. Deploy app to a hosting service and configure domain (30 min) |  |  |
| 4 | presentation | Valid on the first try | 5 | 45.7 s | 1. Assign tasks to teammates (10 min)<br>2. Create presentation slides (30 min)<br>3. Split speaking roles (10 min)<br>4. Practice the presentation (20 min)<br>5. Final check and adjustments (10 min) |  |  |
| 5 | reading | Valid on the first try | 6 | 15.7 s | 1. Get the textbook (10 min)<br>2. Read chapter 3 on process scheduling (30 min)<br>3. Read chapter 4 on synchronization (30 min)<br>4. Take notes on key concepts (20 min)<br>5. Review notes for understanding (15 min)<br>6. Prepare summary for viva (25 min) |  |  |
| 6 | vague-one-liner | Valid on the first try | 7 | 24.7 s | 1. Understand the assignment requirements (15 min)<br>2. Collect all required materials and resources (20 min)<br>3. Break down the assignment into parts and outline the plan (25 min)<br>4. Research and gather information for each part (30 min)<br>5. Write or create content for each section (40 min)<br>6. Review and edit the work for clarity and accuracy (20 min)<br>7. Prepare the final version for submission, checking formatting and requirements (15 min) |  |  |
| 7 | very-long-description | Valid on the first try | 10 | 25.2 s | 1. Create requirements document (60 min)<br>2. Design database schema with eight tables (90 min)<br>3. Compare map libraries for frontend (30 min)<br>4. Develop backend with Node and PostgreSQL (120 min)<br>5. Build student app interface and map functionality (150 min)<br>6. Develop driver app with GPS integration (60 min)<br>7. Implement admin panel for route and stop management (90 min)<br>8. Add notification system for bus proximity alerts (60 min)<br>9. Conduct user testing with ten students (60 min)<br>10. Write comprehensive project report with literature review (120 min) |  |  |
| 8 | prompt-injection | Valid on the first try | 7 | 25.4 s | 1. Review titration theory (20 min)<br>2. Analyze procedure steps from lab manual (20 min)<br>3. Organize existing lab notes (15 min)<br>4. Create structured lab notebook format (15 min)<br>5. Practice titration steps with simulation (25 min)<br>6. Check notebook for missing data entries (10 min)<br>7. Review all procedure and notebook steps (15 min) |  |  |
| 9 | mixed-english-hindi | Valid on the first try | 5 | 39.0 s | 1. Collect all necessary materials (5 min)<br>2. Read chapter 5 to understand concepts (15 min)<br>3. Solve all numerical problems step by step (45 min)<br>4. Write one-page summary of chapter 5 (30 min)<br>5. Review solutions and summary for accuracy (20 min) |  |  |
| 10 | already-small | Valid on the first try | 5 | 13.7 s | 1. Find the professor's email address (5 min)<br>2. Recall assignment details for the email (10 min)<br>3. Draft the email subject line (5 min)<br>4. Compose the email body with the request (15 min)<br>5. Check the email for errors (10 min) |  |  |

## What each case tests

- **lab-report**: A typical lab report with a clear deadline.
- **exam-revision**: Exam revision: broad, many chapters.
- **mini-project**: A small software project.
- **presentation**: A presentation with a fixed time slot.
- **reading**: A reading task with no deadline.
- **vague-one-liner**: Almost no information: the model must not invent a whole project.
- **very-long-description**: More than 3,000 characters: the prompt cuts the description to 1,500.
- **prompt-injection**: The description tries to take over the model. Output must still be a validated plan.
- **mixed-english-hindi**: English mixed with Hindi words, as students often write.
- **already-small**: A task that is already one small action, and one step already planned.
