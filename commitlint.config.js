export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'perf', 'test', 'docs', 'chore', 'ci', 'build', 'revert'],
    ],
    'scope-enum': [
      2,
      'always',
      // 'deps-dev' is what dependabot uses for devDependency bumps
      // (`build(deps-dev): bump <pkg>`). Without it on the allow-list
      // every devDep PR fails the commit-message check.
      ['backend', 'web', 'sdk', 'infra', 'deps', 'deps-dev', 'ci'],
    ],
    'subject-max-length': [2, 'always', 72],
  },
};
