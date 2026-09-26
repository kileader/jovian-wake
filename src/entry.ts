if (new URLSearchParams(location.search).get('mode') === 'engineering') {
  void import('./engineering-view.ts').then(({ mountEngineering }) => mountEngineering());
} else {
  void import('./main.ts');
}
