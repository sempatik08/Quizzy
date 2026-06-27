Project Title: QUIZZY
Role: Senior Full-Stack Software Architect & Game Designer.
Objective: Develop a real-time, browser-based competitive quiz game titled "Quizzy".
1. Project Context & Vision
We are building a web application called Quizzy that adopts the minimalist and clean "room/lobby" UI logic of Codenames, but features a high-stakes, multiple-choice quiz mechanic. The focus is on real-time team collaboration, strategic voting, and a "steal" mechanic that keeps the competition intense until the last second.
2. Technical Stack

Frontend: Next.js (App Router), Tailwind CSS, Lucide-react (for icons).
Backend/Real-time: Node.js + [Socket.io](http://Socket.io).
Data Management: No database for Phase 1. Store all room data in a server-side rooms object (In-memory storage).
Game Flow & Rules
Phase A: Entry & Lobby (Codenames Aesthetics)

Home: A minimalist "Create Room" or "Join Room" (via code) screen.
Lobby: Team selection (Blue vs. Red). Each team capacity: 1-3 players.
Captaincy: If a team has 2+ players, an automatic "Captain Election" vote starts within the team UI.
The Coin Toss: Once teams are locked, an automated coin toss occurs. The winning captain selects a category from 4 options: General Culture, Sports, History, Cinema & Music.
Phase B: Gameplay Mechanics

Question Structure: High-difficulty questions with 5 options (A-E). Options must be tricky and conceptually close to each other to spark debate.
Team Voting: Team members vote on options in real-time. Their selections are visible to their teammates (e.g., small colored bubbles or initials next to the choices). After 60s, the option with the most votes is automatically submitted.
Scoring & Turns:
Correct Answer: 5 Points.
Incorrect Answer: The selected option is disabled (marked with a red X), and the turn passes to the opposing team.
Steal Bonus: If the opposing team correctly answers the inherited question (with fewer options remaining), they earn 10 Points.
Win Condition: First team to reach 100 Points wins the match.
Output Structure (Development Steps for the Agent)
Please proceed with the following sequence:

Folder Structure: Set up a workspace where Next.js and the [Socket.io](http://Socket.io) server can run concurrently (e.g., using a custom server or a separate Node process).
Server Logic: Create server.js to handle real-time events: room creation/joining, team assignment, voting synchronization, and turn-based game state.
Frontend State: Implement a useGame hook or React Context to sync the server's state with the UI (scores, timers, active players, and vote distribution).
UI Components: Build the Lobby and Question screens using Quizzy's aesthetic: pastel colors (soft blues/reds), clean typography, and card-based layouts inspired by Codenames.
Example Data Set (Target Difficulty)
Ensure the question pool matches this level of "confusing" complexity:

Question: "Which of the following structures was built before the Conquest of Istanbul (1453)?"
Options: A) Rumeli Fortress, B) Anatolian Fortress, C) Tiled Kiosk, D) Fatih Mosque, E) Theodosius Cistern.
Note: Use distractors that feel plausible to require team consensus. Instruction for the Agent: "Start by initializing the project structure and the [Socket.io](http://Socket.io) server. Focus on building a robust 'Room and Team' management system first. Let's make sure real-time team selection and captain voting work perfectly before building the quiz engine. Use Quizzy as the primary branding throughout the app."