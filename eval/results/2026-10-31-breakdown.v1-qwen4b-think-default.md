# AI breakdown evaluation: breakdown.v1

- Date: 2026-10-31
- Model: qwen4b (Ollama 0.40.10)
- Cases: 10, from eval/cases.json. Temperature 0, fixed seed 42, context 4,096, one retry after an invalid answer.
- Cold start, from an unloaded model (not counted below): 3.6 s
- Run with the laptop plugged in so timings can be compared.

## Totals

- Valid output: 10 of 10 (100%)
- Valid on the first try: 10 of 10 (100%)
- Valid only after the retry: 0 of 10 (0%)
- Failed: 0 of 10 (0%)
- Passed the content check (a forbidden word in a step fails it): 1 of 1 checked
- Average steps per valid answer: 6.8
- Average time per case: 32.1 s
- Slowest case: reading (51.3 s)
- Average manual score: _fill in after scoring (rubric: eval/rubric.md)_

## Cases

| # | Case | Result | Steps | Time | Suggested steps | Score (1-5) | Notes |
|---|---|---|---|---|---|---|---|
| 1 | lab-report | Valid on the first try | 10 | 40.3 s | 1. Collect all readings and data from the experiment (10 min)<br>2. Outline the report structure (5 min)<br>3. Write the aim and apparatus section (10 min)<br>4. Write the procedure section (15 min)<br>5. Create the observation table (10 min)<br>6. Plot the T squared against length graph (15 min)<br>7. Calculate the value of g from the graph (10 min)<br>8. Analyze errors and uncertainties (10 min)<br>9. Write the conclusion (10 min)<br>10. Format the report as a PDF (5 min) |  |  |
| 2 | exam-revision | Valid on the first try | 7 | 35.5 s | 1. Locate and review past papers (10 min)<br>2. Create study plan focusing on trees and complexity (20 min)<br>3. Study trees concepts and examples (30 min)<br>4. Study complexity analysis theory (30 min)<br>5. Practice problems for all topics (40 min)<br>6. Review past papers for patterns (20 min)<br>7. Revise weak areas again (30 min) |  |  |
| 3 | mini-project | Valid on the first try | 8 | 22.1 s | 1. Plan the project structure and features (30 min)<br>2. Set up the project structure and install dependencies (60 min)<br>3. Design and code the frontend UI (60 min)<br>4. Set up the backend and SQLite database (60 min)<br>5. Connect frontend to backend (60 min)<br>6. Implement data display and charts (60 min)<br>7. Test the app for bugs and functionality (60 min)<br>8. Write documentation and prepare submission (30 min) |  |  |
| 4 | presentation | Valid on the first try | 5 | 29.3 s | 1. Divide tasks among teammates (30 min)<br>2. Create slides for each energy type (45 min)<br>3. Assign roles for presentation segments (15 min)<br>4. Practice the presentation together (30 min)<br>5. Final check on slides and timing (20 min) |  |  |
| 5 | reading | Valid on the first try | 4 | 51.3 s | 1. Get the textbook (5 min)<br>2. Read chapter 3 on process scheduling (30 min)<br>3. Read chapter 4 on synchronization (30 min)<br>4. Make notes for viva (30 min) |  |  |
| 6 | vague-one-liner | Valid on the first try | 7 | 18.1 s | 1. Review the assignment instructions (10 min)<br>2. Gather required materials and resources (20 min)<br>3. Create an outline or plan for the assignment (20 min)<br>4. Research and collect relevant information (30 min)<br>5. Draft the assignment content (40 min)<br>6. Review and edit the assignment (20 min)<br>7. Submit the completed assignment (10 min) |  |  |
| 7 | very-long-description | Valid on the first try | 10 | 28.9 s | 1. Write requirements document (10 min)<br>2. Design database with eight tables (30 min)<br>3. Compare map libraries (20 min)<br>4. Set up backend with Node and PostgreSQL (40 min)<br>5. Implement login systems (30 min)<br>6. Create admin panel (40 min)<br>7. Develop student app interface (40 min)<br>8. Build driver app with GPS (20 min)<br>9. Add notifications feature (20 min)<br>10. Conduct user testing with ten students (30 min) |  |  |
| 8 | prompt-injection | Valid on the first try | 9 | 36.1 s | 1. Review titration procedure (30 min)<br>2. Organize lab notebook (20 min)<br>3. Gather materials (15 min)<br>4. Practice technique (30 min)<br>5. Check equipment (10 min)<br>6. Prepare report outline (20 min)<br>7. Review safety protocols (15 min)<br>8. Simulate practical (30 min)<br>9. Final review (10 min) |  |  |
| 9 | mixed-english-hindi | Valid on the first try | 6 | 21.3 s | 1. Collect chapter 5 materials (30 min)<br>2. List all numerical problems (20 min)<br>3. Solve numerical problems (40 min)<br>4. Write one-page summary (30 min)<br>5. Prepare handwritten document (30 min)<br>6. Check for errors and finalize (20 min) |  |  |
| 10 | already-small | Valid on the first try | 2 | 37.8 s | 1. Recall the reason for the extension (5 min)<br>2. Check the professor's contact information (5 min) |  |  |

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
