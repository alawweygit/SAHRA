window.HYPOX_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCwLgQPaMojnCtph326HPeBauvOKuXg3nw",
    authDomain: "highpox-1eec7.firebaseapp.com",
    databaseURL: "https://highpox-1eec7-default-rtdb.firebaseio.com",
    projectId: "highpox-1eec7",
    storageBucket: "highpox-1eec7.firebasestorage.app",
    messagingSenderId: "305902826099",
    appId: "1:305902826099:web:7ec2e126cbf5ad82913006",
  },
  aiEndpoint: "https://hypox-ai-backend-production.up.railway.app/api/prompts",
};

// Always open a newly displayed game screen at its real top.
// iOS Safari can preserve the previous document/nested-container scroll position
// when the app swaps screens without a full page navigation.
(() => {
  const resetAllScroll = () => {
    const scrollingElement = document.scrollingElement || document.documentElement;

    window.scrollTo(0, 0);
    if (scrollingElement) scrollingElement.scrollTop = 0;
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;

    const app = document.getElementById('app');
    if (app) app.scrollTop = 0;

    document.querySelectorAll('.screen').forEach((screen) => {
      screen.scrollTop = 0;
      screen.scrollLeft = 0;
    });
  };

  const resetAfterTransition = () => {
    resetAllScroll();
    requestAnimationFrame(() => {
      resetAllScroll();
      requestAnimationFrame(resetAllScroll);
    });
    setTimeout(resetAllScroll, 60);
    setTimeout(resetAllScroll, 180);
    setTimeout(resetAllScroll, 400);
  };

  document.addEventListener('DOMContentLoaded', () => {
    resetAfterTransition();

    const app = document.getElementById('app');
    if (app) {
      const observer = new MutationObserver((mutations) => {
        const screenChanged = mutations.some((mutation) =>
          mutation.type === 'attributes' &&
          mutation.attributeName === 'class' &&
          mutation.target.classList?.contains('screen')
        );

        if (screenChanged) resetAfterTransition();
      });

      observer.observe(app, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    }

    // Buttons such as NEXT often update content and then swap screens asynchronously.
    document.addEventListener('click', (event) => {
      if (event.target.closest('button, [role="button"], .choice-btn')) {
        setTimeout(resetAfterTransition, 0);
      }
    }, true);

    window.addEventListener('popstate', resetAfterTransition);
    window.addEventListener('pageshow', resetAfterTransition);
  });
})();