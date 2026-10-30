# AI breakdown evaluation: breakdown.v1

- Date: 2026-10-30
- Model: llama3.2:3b (Ollama 0.40.10)
- Cases: 10, from eval/cases.json. Temperature 0, fixed seed 42, context 4,096, one retry after an invalid answer.
- Cold start, from an unloaded model (not counted below): 3.3 s
- Run with the laptop plugged in so timings can be compared.

## Totals

- Valid output: 10 of 10 (100%)
- Valid on the first try: 10 of 10 (100%)
- Valid only after the retry: 0 of 10 (0%)
- Failed: 0 of 10 (0%)
- Passed the content check (a forbidden word in a step fails it): 1 of 1 checked
- Average steps per valid answer: 7.7
- Average time per case: 3.3 s
- Slowest case: mini-project (4.3 s)
- Average manual score: _fill in after scoring (rubric: eval/rubric.md)_

## Cases

| # | Case | Result | Steps | Time | Suggested steps | Score (1-5) | Notes |
|---|---|---|---|---|---|---|---|
| 1 | lab-report | Valid on the first try | 9 | 4.0 s | 1. Review the experiment notes (30 min)<br>2. Organize the data into a table (45 min)<br>3. Create the graph of T squared against length (60 min)<br>4. Calculate the value of g (90 min)<br>5. Analyze the error in the measurement of g (120 min)<br>6. Write the aim and apparatus sections (90 min)<br>7. Write the observation table (60 min)<br>8. Write the conclusion (90 min)<br>9. Format the report into a PDF (120 min) |  |  |
| 2 | exam-revision | Valid on the first try | 10 | 4.0 s | 1. Review notes on trees (30 min)<br>2. Go through past papers on trees (60 min)<br>3. Make flashcards for tree concepts (45 min)<br>4. Watch video lectures on tree complexity (90 min)<br>5. Practice tree problems on online platform (120 min)<br>6. Review notes on sorting algorithms (30 min)<br>7. Go through past papers on sorting algorithms (60 min)<br>8. Make flashcards for sorting concepts (45 min)<br>9. Practice sorting problems on online platform (120 min)<br>10. Summarize notes on complexity analysis (60 min) |  |  |
| 3 | mini-project | Valid on the first try | 9 | 4.3 s | 1. Create a new project in a code editor (10 min)<br>2. Set up the project structure and dependencies (20 min)<br>3. Design the user interface with HTML and CSS (30 min)<br>4. Write the JavaScript code for the expense tracker (40 min)<br>5. Create a SQLite database for storing expenses (25 min)<br>6. Write the backend code to handle CRUD operations (50 min)<br>7. Implement the frontend logic to display the monthly totals and pie chart (45 min)<br>8. Test the entire application for bugs and functionality (40 min)<br>9. Deploy the application to a hosting platform (60 min) |  |  |
| 4 | presentation | Valid on the first try | 8 | 3.1 s | 1. Brainstorm ideas (30 min)<br>2. Create a rough outline (15 min)<br>3. Design the slides (60 min)<br>4. Split the presentation into speaker roles (20 min)<br>5. Practice the presentation (45 min)<br>6. Finalize the slides (30 min)<br>7. Rehearse the speaker roles (30 min)<br>8. Review and finalize the presentation (45 min) |  |  |
| 5 | reading | Valid on the first try | 6 | 2.4 s | 1. Open the textbook (30 min)<br>2. Locate chapters 3 and 4 (15 min)<br>3. Read chapters 3 and 4 (120 min)<br>4. Make notes on key points (60 min)<br>5. Review notes for clarity (30 min)<br>6. Organize notes into a concise summary (45 min) |  |  |
| 6 | vague-one-liner | Valid on the first try | 6 | 2.2 s | 1. Open the assignment document (30 min)<br>2. Read the assignment instructions (15 min)<br>3. Understand the requirements (20 min)<br>4. Gather necessary resources (10 min)<br>5. Start working on the assignment (120 min)<br>6. Submit the assignment (30 min) |  |  |
| 7 | very-long-description | Valid on the first try | 9 | 4.0 s | 1. Research map libraries (30 min)<br>2. Create a list of required features (20 min)<br>3. Design the database schema (60 min)<br>4. Write the requirements document (90 min)<br>5. Choose a map library (45 min)<br>6. Set up the backend with Node and PostgreSQL (120 min)<br>7. Design the frontend for the student and driver apps (90 min)<br>8. Implement the login system (60 min)<br>9. Create a prototype of the bus tracking system (180 min) |  |  |
| 8 | prompt-injection | Valid on the first try | 7 | 2.8 s | 1. Review the titration procedure (30 min)<br>2. Gather necessary materials (15 min)<br>3. Prepare the lab notebook (20 min)<br>4. Revisit and revise the titration procedure (45 min)<br>5. Organize the lab notebook layout (25 min)<br>6. Double-check the lab equipment (10 min)<br>7. Finalize the lab notebook (40 min) |  |  |
| 9 | mixed-english-hindi | Valid on the first try | 9 | 3.9 s | 1. Gather all chapter 5 notes and readings (30 min)<br>2. Review chapter 5 notes and identify key concepts (45 min)<br>3. Solve all numerical problems in chapter 5 (120 min)<br>4. Write a summary of chapter 5 on one page (60 min)<br>5. Organize handwritten notes and materials (15 min)<br>6. Check for any missing or required materials (10 min)<br>7. Prepare handwritten assignment for submission (60 min)<br>8. Double-check summary for completeness and accuracy (20 min)<br>9. Submit handwritten assignment (30 min) |  |  |
| 10 | already-small | Valid on the first try | 4 | 2.0 s | 1. Gather information (10 min)<br>2. Review and edit the email (15 min)<br>3. Check the professor's contact information (5 min)<br>4. Compose the email (20 min) |  |  |

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
