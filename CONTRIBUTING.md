# Contributing

Bug reports and focused improvement suggestions are welcome.

Before submitting an issue or pull request:

1. Never include real credentials, CAPTCHA content or unused serial codes.
2. Confirm the issue still occurs on the latest development version.
3. Keep CAPTCHA entry and final form submission fully manual.
4. Do not broaden host access beyond the minimum official HKTR/FunTown pages.
5. Run all tests before proposing a code change.

```sh
node tests/crypto-utils.test.js
node tests/background.test.js
node tests/security.test.js
```

For vulnerabilities, follow [SECURITY.md](SECURITY.md) instead of opening a
public issue.

