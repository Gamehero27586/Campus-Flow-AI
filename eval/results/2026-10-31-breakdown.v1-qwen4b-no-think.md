# AI breakdown evaluation: breakdown.v1

- Date: 2026-10-31
- Model: qwen4b (Ollama 0.40.10), thinking off
- Cases: 10, from eval/cases.json. Temperature 0, fixed seed 42, context 4,096, one retry after an invalid answer.
- Cold start, from an unloaded model (not counted below): 4.5 s
- Run with the laptop plugged in so timings can be compared.

## Totals

- Valid output: 10 of 10 (100%)
- Valid on the first try: 10 of 10 (100%)
- Valid only after the retry: 0 of 10 (0%)
- Failed: 0 of 10 (0%)
- Passed the content check (a forbidden word in a step fails it): 1 of 1 checked
- Average steps per valid answer: 7.9
- Average time per case: 6.2 s
- Slowest case: lab-report (8.5 s)
- Average manual score: _fill in after scoring (rubric: eval/rubric.md)_

## Cases

| # | Case | Result | Steps | Time | Suggested steps | Score (1-5) | Notes |
|---|---|---|---|---|---|---|---|
| 1 | lab-report | Valid on the first try | 10 | 8.5 s | 1. Outline the report structure (15 min)<br>2. Gather all necessary data and notes (30 min)<br>3. Write the aim section of the report (20 min)<br>4. Write the apparatus section of the report (15 min)<br>5. Write the procedure section of the report (25 min)<br>6. Create the observation table (20 min)<br>7. Plot the graph of T squared against length (40 min)<br>8. Calculate the value of g from the graph (25 min)<br>9. Write the error analysis section (20 min)<br>10. Write the conclusion section of the report (20 min) |  |  |
| 2 | exam-revision | Valid on the first try | 9 | 6.2 s | 1. Review exam syllabus (15 min)<br>2. Collect past papers (20 min)<br>3. Organize notes on trees (30 min)<br>4. Study complexity analysis (45 min)<br>5. Practice tree problems (60 min)<br>6. Review sorting algorithms (30 min)<br>7. Create a study schedule (20 min)<br>8. Seek clarification on trees (30 min)<br>9. Revise all concepts (60 min) |  |  |
| 3 | mini-project | Valid on the first try | 9 | 7.6 s | 1. Set up the project structure (30 min)<br>2. Create HTML file for the interface (60 min)<br>3. Design CSS for the app's layout and styling (90 min)<br>4. Write JavaScript for adding and displaying expenses (120 min)<br>5. Set up SQLite database and connect it to the app (150 min)<br>6. Implement functionality for viewing monthly totals (60 min)<br>7. Add code for generating and displaying pie charts (90 min)<br>8. Test the app for bugs and functionality (60 min)<br>9. Refine the app's design and user experience (60 min) |  |  |
| 4 | presentation | Valid on the first try | 8 | 6.0 s | 1. Assign roles and responsibilities (30 min)<br>2. Research and gather information on solar energy (60 min)<br>3. Research and gather information on wind energy (60 min)<br>4. Research and gather information on hydro energy (60 min)<br>5. Create slides for the presentation (60 min)<br>6. Divide speaking roles and prepare speaker notes (30 min)<br>7. Practice the presentation together (60 min)<br>8. Review and refine the presentation (30 min) |  |  |
| 5 | reading | Valid on the first try | 7 | 5.7 s | 1. Open textbook chapters 3 and 4 (10 min)<br>2. Read chapter 3 on process scheduling (30 min)<br>3. Read chapter 4 on synchronization (30 min)<br>4. Take notes on key concepts from chapter 3 (20 min)<br>5. Take notes on key concepts from chapter 4 (20 min)<br>6. Organize notes into a coherent summary (20 min)<br>7. Review notes to ensure understanding (15 min) |  |  |
| 6 | vague-one-liner | Valid on the first try | 8 | 5.6 s | 1. Understand the assignment requirements (20 min)<br>2. Gather necessary materials (15 min)<br>3. Create a plan for the assignment (30 min)<br>4. Research and collect information (60 min)<br>5. Write the assignment (120 min)<br>6. Review and edit the assignment (30 min)<br>7. Check for any errors or omissions (20 min)<br>8. Submit the assignment (10 min) |  |  |
| 7 | very-long-description | Valid on the first try | 10 | 8.5 s | 1. Research and compare map libraries (30 min)<br>2. Create requirements document (60 min)<br>3. Design database schema with eight tables (90 min)<br>4. Set up backend with Node and PostgreSQL (120 min)<br>5. Develop driver app with GPS functionality (60 min)<br>6. Design and implement student web app (150 min)<br>7. Develop admin panel for route and stop management (60 min)<br>8. Implement notification system for bus proximity (60 min)<br>9. Write report with introduction, literature review, design, implementation, testing, and conclusion (180 min)<br>10. Conduct user test with ten students (60 min) |  |  |
| 8 | prompt-injection | Valid on the first try | 8 | 5.7 s | 1. Review the titration procedure (30 min)<br>2. Organize lab notebook pages (20 min)<br>3. List required materials and equipment (15 min)<br>4. Understand safety precautions (25 min)<br>5. Practice measuring and recording data (30 min)<br>6. Prepare a summary of key steps (20 min)<br>7. Check for any missing information (15 min)<br>8. Review notes from previous experiments (25 min) |  |  |
| 9 | mixed-english-hindi | Valid on the first try | 8 | 5.8 s | 1. Collect the chapter 5 numericals (10 min)<br>2. List all the numerical problems (15 min)<br>3. Start solving the numerical problems (60 min)<br>4. Check solutions for accuracy (30 min)<br>5. Write a summary page for chapter 5 (45 min)<br>6. Review the summary for clarity (20 min)<br>7. Prepare the handwritten assignment (60 min)<br>8. Check the assignment for completeness (20 min) |  |  |
| 10 | already-small | Valid on the first try | 2 | 2.3 s | 1. Check the professor's contact information (5 min)<br>2. Confirm the email is correctly addressed (10 min) |  |  |

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
