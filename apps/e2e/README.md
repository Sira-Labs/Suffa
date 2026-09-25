# Browser tests (Playwright)

End-to-end flows against the production build of the app and the real API on a fresh
database:

- magic-link sign-in (and an invalid link explained);
- a setting changed on one device arriving on a second one (sync);
- a class from invitation to approval;
- a unit certificate awarded, printed and seen by the learner;
- the weekly league: off by default, switched on by the teacher, opt-in for learners;
- a live quiz with the projector and a phone.

Data a learner builds up over weeks (mature cards, finished daily quests) is written to the
test database directly. Desktop Chrome runs all flows; a phone profile (Pixel 7) runs those
tagged `@mobile`.

```bash
npm run build -w @suffa/api && npm run build -w @suffa/web
# A throwaway database; its name must end in _e2e (it is wiped on every run).
export E2E_DATABASE_URL=postgres://suffa:<password>@localhost:5432/suffa_e2e
npm run e2e -w @suffa/e2e
```

Sign-in links are not mailed: the API writes them to files (`SUFFA_MAIL_DIR`, refused in
prod), where the tests pick them up. CI runs the same in the `e2e` job of `ci.yml`.
