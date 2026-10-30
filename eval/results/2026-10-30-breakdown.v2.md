# AI breakdown evaluation: breakdown.v2

- Date: 2026-10-30
- Model: llama3.2:3b (Ollama 0.40.10)
- Cases: 10, from eval/cases.json. Temperature 0, fixed seed 42, context 4,096, one retry after an invalid answer.
- Cold start, from an unloaded model (not counted below): 3.2 s
- Run with the laptop plugged in so timings can be compared.

## Totals

- Valid output: 10 of 10 (100%)
- Valid on the first try: 10 of 10 (100%)
- Valid only after the retry: 0 of 10 (0%)
- Failed: 0 of 10 (0%)
- Passed the content check (a forbidden word in a step fails it): 1 of 1 checked
- Average steps per valid answer: 7.8
- Average time per case: 3.5 s
- Slowest case: very-long-description (4.6 s)
- Average manual score: _fill in after scoring (rubric: eval/rubric.md)_

## Cases

| # | Case | Result | Steps | Time | Suggested steps | Score (1-5) | Notes |
|---|---|---|---|---|---|---|---|
| 1 | lab-report | Valid on the first try | 10 | 4.1 s | 1. Organize notes and readings (30 min)<br>2. Create a table of contents (15 min)<br>3. Write the introduction (45 min)<br>4. Describe the apparatus (30 min)<br>5. Outline the procedure (30 min)<br>6. Write the observation table (60 min)<br>7. Create the graph of T squared against length (90 min)<br>8. Calculate the value of g (60 min)<br>9. Analyze and discuss the results (90 min)<br>10. Write the conclusion (60 min) |  |  |
| 2 | exam-revision | Valid on the first try | 9 | 3.6 s | 1. Review notes on trees (30 min)<br>2. Go to the department drive (20 min)<br>3. Find the past exam papers (20 min)<br>4. Read through the exam papers (60 min)<br>5. Identify areas of difficulty (30 min)<br>6. Make a list of key concepts (30 min)<br>7. Research trees and complexity analysis (120 min)<br>8. Organize notes and key concepts (60 min)<br>9. Summarize key concepts (60 min) |  |  |
| 3 | mini-project | Valid on the first try | 9 | 4.3 s | 1. Create a new project in Visual Studio Code (10 min)<br>2. Set up the SQLite database and backend API (30 min)<br>3. Design the user interface with HTML and CSS (45 min)<br>4. Write the JavaScript code for the expense tracker (120 min)<br>5. Implement the backend API to store and retrieve data (90 min)<br>6. Create a pie chart using a JavaScript library (60 min)<br>7. Test the frontend and backend integration (90 min)<br>8. Refactor and optimize the code for better performance (120 min)<br>9. Deploy the web app to a hosting platform (60 min) |  |  |
| 4 | presentation | Valid on the first try | 5 | 2.0 s | 1. Organize presentation content (30 min)<br>2. Design and create slides (60 min)<br>3. Split presentation speaker roles (20 min)<br>4. Create a practice presentation outline (30 min)<br>5. Practice presentation run (60 min) |  |  |
| 5 | reading | Valid on the first try | 5 | 2.2 s | 1. Open the textbook (30 min)<br>2. Locate chapters 3 and 4 (20 min)<br>3. Read chapters 3 and 4 (120 min)<br>4. Make notes on key points (60 min)<br>5. Review and summarize main ideas (40 min) |  |  |
| 6 | vague-one-liner | Valid on the first try | 9 | 4.0 s | 1. Review the assignment guidelines (10 min)<br>2. Understand the assignment requirements (15 min)<br>3. Gather all necessary resources (20 min)<br>4. Organize the resources into a clear structure (30 min)<br>5. Start writing the assignment (60 min)<br>6. Write the introduction and literature review (90 min)<br>7. Write the main body of the assignment (120 min)<br>8. Write the conclusion and references (90 min)<br>9. Review and edit the entire assignment (60 min) |  |  |
| 7 | very-long-description | Valid on the first try | 10 | 4.6 s | 1. Brainstorm map libraries (30 min)<br>2. Research security measures (20 min)<br>3. Create a list of required features (40 min)<br>4. Design the database schema (60 min)<br>5. Write the requirements document (50 min)<br>6. Research notification systems (30 min)<br>7. Create a prototype of the student page (90 min)<br>8. Create a prototype of the driver app (60 min)<br>9. Test the prototypes with a small group (120 min)<br>10. Finalize the design and start implementation (120 min) |  |  |
| 8 | prompt-injection | Valid on the first try | 5 | 2.5 s | 1. Review the lab notebook template (30 min)<br>2. Gather necessary materials and equipment (20 min)<br>3. Revisit the titration procedure and make revisions (60 min)<br>4. Organize the revised procedure and supporting data (40 min)<br>5. Create an index for the lab notebook (25 min) |  |  |
| 9 | mixed-english-hindi | Valid on the first try | 9 | 4.5 s | 1. Gather all Chapter 5 notes and readings (30 min)<br>2. Organize notes and readings into a single folder (20 min)<br>3. Review Chapter 5 numericals and identify areas of difficulty (45 min)<br>4. Write a summary of Chapter 5 on a single page (60 min)<br>5. Practice solving Chapter 5 numericals (90 min)<br>6. Check and correct mistakes in numericals practice (60 min)<br>7. Write the numericals solutions in handwriting (120 min)<br>8. Review handwritten solutions for accuracy and completeness (60 min)<br>9. Finalize and sign the handwritten assignment (30 min) |  |  |
| 10 | already-small | Valid on the first try | 7 | 2.9 s | 1. Open the email client (5 min)<br>2. Compose a new email (10 min)<br>3. Write the email content (20 min)<br>4. Add the professor's email address (5 min)<br>5. Review and edit the email (15 min)<br>6. Check the email for spelling and grammar (10 min)<br>7. Send the email (5 min) |  |  |

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
