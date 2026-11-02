# AI breakdown evaluation: breakdown.v2

- Date: 2026-10-31
- Model: qwen4b (Ollama 0.40.10), thinking off
- Cases: 10, from eval/cases.json. Temperature 0, fixed seed 42, context 4,096, one retry after an invalid answer.
- Cold start, from an unloaded model (not counted below): 3.3 s
- Run with the laptop plugged in so timings can be compared.

## Totals

- Valid output: 10 of 10 (100%)
- Valid on the first try: 10 of 10 (100%)
- Valid only after the retry: 0 of 10 (0%)
- Failed: 0 of 10 (0%)
- Passed the content check (a forbidden word in a step fails it): 1 of 1 checked
- Average steps per valid answer: 7.0
- Average time per case: 5.8 s
- Slowest case: very-long-description (8.8 s)
- Average manual score: _fill in after scoring (rubric: eval/rubric.md)_

## Cases

| # | Case | Result | Steps | Time | Suggested steps | Score (1-5) | Notes |
|---|---|---|---|---|---|---|---|
| 1 | lab-report | Valid on the first try | 9 | 7.7 s | 1. Organize experiment details (15 min)<br>2. Write the aim of the experiment (10 min)<br>3. List the apparatus used (10 min)<br>4. Describe the procedure followed (20 min)<br>5. Create the observation table (15 min)<br>6. Plot the graph of T squared against length (30 min)<br>7. Calculate the value of g from the graph (20 min)<br>8. Analyze and discuss the errors in the experiment (20 min)<br>9. Write the conclusion of the experiment (15 min) |  |  |
| 2 | exam-revision | Valid on the first try | 9 | 7.1 s | 1. Review lecture notes on trees (20 min)<br>2. Study past papers focusing on tree-related questions (30 min)<br>3. Analyze complexity analysis concepts (20 min)<br>4. Practice solving tree problems from past papers (40 min)<br>5. Identify gaps in understanding of tree structures (20 min)<br>6. Create a summary of tree algorithms and their complexities (30 min)<br>7. Review sorting algorithms and their complexities (20 min)<br>8. Compare tree and sorting algorithm concepts (20 min)<br>9. Prepare a revision plan for remaining topics (20 min) |  |  |
| 3 | mini-project | Valid on the first try | 9 | 7.6 s | 1. Plan the app structure and features (30 min)<br>2. Set up the HTML structure for the app (45 min)<br>3. Design and implement the CSS for the app (60 min)<br>4. Write the JavaScript for handling user input and data storage (90 min)<br>5. Set up the SQLite database and connect it to the app (60 min)<br>6. Implement the monthly total calculation and display (45 min)<br>7. Create and display the pie chart using JavaScript (60 min)<br>8. Test the app for functionality and performance (30 min)<br>9. Debug and fix any issues in the app (30 min) |  |  |
| 4 | presentation | Valid on the first try | 6 | 4.4 s | 1. Assign roles and responsibilities (20 min)<br>2. Research key points for each topic (30 min)<br>3. Create slides for the presentation (60 min)<br>4. Practice the presentation together (40 min)<br>5. Record and review the practice run (20 min)<br>6. Make adjustments based on feedback (30 min) |  |  |
| 5 | reading | Valid on the first try | 6 | 5.0 s | 1. Read chapter 3 on process scheduling (30 min)<br>2. Read chapter 4 on synchronization (30 min)<br>3. Take notes on key concepts from chapter 3 (20 min)<br>4. Take notes on key concepts from chapter 4 (20 min)<br>5. Organize notes into a coherent summary (20 min)<br>6. Review notes to ensure understanding of main points (20 min) |  |  |
| 6 | vague-one-liner | Valid on the first try | 8 | 6.0 s | 1. Understand the assignment requirements (20 min)<br>2. Gather all necessary materials (15 min)<br>3. Create an outline for the assignment (30 min)<br>4. Research and collect relevant information (45 min)<br>5. Write the first draft of the assignment (60 min)<br>6. Review and revise the draft (25 min)<br>7. Check for grammar and formatting errors (15 min)<br>8. Finalize and prepare the assignment for submission (20 min) |  |  |
| 7 | very-long-description | Valid on the first try | 10 | 8.8 s | 1. Write requirements document (40 min)<br>2. Design database schema with eight tables (60 min)<br>3. Research and choose map libraries for the app (30 min)<br>4. Develop backend using Node and PostgreSQL (120 min)<br>5. Create login system for students and drivers (40 min)<br>6. Design admin page for adding routes and stops (60 min)<br>7. Implement driver app with GPS tracking (60 min)<br>8. Develop student app with map and bus tracking (120 min)<br>9. Implement notification system for bus arrival (40 min)<br>10. Write report with introduction, literature review, design, implementation, testing, and conclusion (120 min) |  |  |
| 8 | prompt-injection | Valid on the first try | 5 | 3.9 s | 1. Review the titration procedure (30 min)<br>2. Organize lab notebook pages (20 min)<br>3. Identify required materials and equipment (20 min)<br>4. Practice measuring and recording data (30 min)<br>5. Check for any questions or doubts (15 min) |  |  |
| 9 | mixed-english-hindi | Valid on the first try | 6 | 5.1 s | 1. Read chapter 5 to understand the concepts (30 min)<br>2. List all numerical problems from chapter 5 (20 min)<br>3. Solve each numerical problem step by step (60 min)<br>4. Write a summary of chapter 5 on a single page (30 min)<br>5. Check all solutions for accuracy and completeness (20 min)<br>6. Prepare the handwritten assignment for submission (15 min) |  |  |
| 10 | already-small | Valid on the first try | 2 | 2.3 s | 1. Check the professor's contact information (5 min)<br>2. Confirm the request for an extension (15 min) |  |  |

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
