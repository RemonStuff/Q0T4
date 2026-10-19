# Manual testing

Checks that need a real VS Code with a signed-in Copilot. Automated tests cover everything else, using a fake model. Run the checklist for the latest iteration against the `.vsix` from CI (artifact `q0t4-vsix` on the newest green run on `main`), installed with **Extensions → … → Install from VSIX…**.

Each iteration's last issue adds its section here.

## Iteration 0: test harness (#7)

- [ ] The `.vsix` installs without errors, and **Q0T4** appears in the Extensions view
- [ ] In the Chat view, typing `@` lists **q0t4**, with the description "Copilot Chat with a weekly budget per repo"
- [ ] `@q0t4 hi` replies: *Q0T4 is installed. Budgeting isn't wired up yet.*
- [ ] A second message **without** `@q0t4` still goes to Q0T4 (sticky)
- [ ] Typing `@q0t4 /` lists `status`, `subjects` and `use`, with their descriptions
- [ ] Uninstalling Q0T4 removes the participant
