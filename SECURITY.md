# Security notes

## Firebase Web API key

`app.js` contains a Firebase **Web** configuration `apiKey`. For browser apps this value is public by design: it identifies the Firebase project, it is not an admin credential. Hiding it or reverting a commit does not secure the project.

Access is controlled by:

- Firebase Authentication
- Firestore / Realtime Database Security Rules
- Authorized domains in Firebase Authentication settings
- App Check (recommended for production)

## If a key was pushed

A `git revert` does **not** remove a secret from Git history. If a private key (service account, server-side API key, token) was committed and pushed:

1. Revoke or rotate it immediately in the provider console.
2. Remove it from all branches/history (e.g. `git filter-repo` or BFG) after rotation.
3. Coordinate before force-pushing; collaborators must re-clone or rebase.
4. Re-enable push protection / secret scanning and add pre-commit key scanning.

For this project's Firebase Web key, rotation is optional unless a private credential was also exposed. Verify:

- [ ] Check whether the commit was pushed: `git log --oneline --decorate -5` and `git remote -v`, then inspect the GitHub commit history.
- [ ] Firebase Console → Project settings → authorized domains: only your real domains plus `localhost` for development.
- [ ] Firestore / Realtime Database → Rules: require `request.auth != null` and validate writes; run the Rules simulator.
- [ ] Firebase Authentication: review enabled providers and disable anonymous sign-in if unused.
- [ ] Enable App Check for production traffic.
- [ ] GitHub → Security → Secret scanning: if the alert is only this Web key, mark it as a false positive; rotate if a private key is flagged.
- [ ] If you later move secrets to environment variables, add `.env` to `.gitignore` first.

The UI overhaul files (`scoresheet.css`, `Mahjong.html`, `manifest.json`, `sw.js`) contain no key material. The Firebase key lives only in `app.js`, which was not changed by the UI work.
