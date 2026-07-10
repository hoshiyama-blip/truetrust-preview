/* ============================================================
   True Trust 公式サイト 共通スクリプト
   範囲: BLUEPRINT §2-3 のみ(依存ゼロ・30KB未満)
   1) ヘッダーのスクロール状態
   2) SPハンバーガーメニュー
   3) IntersectionObserver によるリビール(GSAP等は使わない)
   4) sticky予約バーの表示制御(scroll>200px / body[data-cta="off"]で無効)
   5) ヒーロー動画の遅延注入・再生制御(TOP=REVISION_SPEC §A / 店舗=STORE_CV_SPEC §6)
   6) GA4イベント計測フック(gtag導入後に自動で有効化)
   ============================================================ */
(function () {
  'use strict';

  var prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----------------------------------------------------------
     1. ヘッダーのスクロール状態(is-scrolled)
     ---------------------------------------------------------- */
  var header = document.querySelector('.site-header');
  var ctaBar = document.querySelector('.cta-bar');
  var ctaDisabled = document.body.getAttribute('data-cta') === 'off';
  var SCROLL_ON = 24;   /* ヘッダー影の閾値 */
  var CTA_ON = 200;     /* 予約バー表示の閾値(§3-3) */
  var ticking = false;

  function onScroll() {
    var y = window.scrollY || document.documentElement.scrollTop;
    if (header) {
      header.classList.toggle('is-scrolled', y > SCROLL_ON);
    }
    if (ctaBar && !ctaDisabled) {
      ctaBar.classList.toggle('is-visible', y > CTA_ON);
    }
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(onScroll);
    }
  }, { passive: true });
  onScroll();

  /* ----------------------------------------------------------
     2. SPハンバーガーメニュー(aria-expanded・Escで閉じる)
     ---------------------------------------------------------- */
  var toggle = document.querySelector('.menu-toggle');
  var spMenu = document.getElementById('sp-menu');

  function setMenu(open) {
    if (!toggle || !spMenu) { return; }
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
    spMenu.classList.toggle('is-open', open);
    document.documentElement.style.overflow = open ? 'hidden' : '';
  }

  if (toggle && spMenu) {
    toggle.addEventListener('click', function () {
      setMenu(toggle.getAttribute('aria-expanded') !== 'true');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { setMenu(false); }
    });
    /* メニュー内リンクを踏んだら閉じる(ページ内アンカー対策) */
    spMenu.addEventListener('click', function (e) {
      if (e.target.closest('a')) { setMenu(false); }
    });
  }

  /* ----------------------------------------------------------
     3. リビール(IO + クラス付与のみ)
        対象: .reveal / .reveal-img / .reveal-lines / .reveal-chars
     ---------------------------------------------------------- */
  var revealTargets = document.querySelectorAll('.reveal, .reveal-img, .reveal-lines, .reveal-chars');

  /* .reveal-chars: 1文字ずつ出すため span.char に分割(ヒーロー縦書き用) */
  document.querySelectorAll('.reveal-chars').forEach(function (el) {
    if (el.dataset.charsReady) { return; }
    var text = el.textContent;
    el.textContent = '';
    el.setAttribute('aria-label', text);
    var frag = document.createDocumentFragment();
    var step = prefersReduced ? 0 : 1.2 / Math.max(text.length, 1); /* 計1.2s(§4-2) */
    for (var i = 0; i < text.length; i++) {
      var span = document.createElement('span');
      span.className = 'char';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = text[i];
      span.style.transitionDelay = (i * step).toFixed(2) + 's';
      frag.appendChild(span);
    }
    el.appendChild(frag);
    el.dataset.charsReady = '1';
  });

  if (prefersReduced || !('IntersectionObserver' in window)) {
    revealTargets.forEach(function (el) { el.classList.add('is-visible'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    revealTargets.forEach(function (el) { io.observe(el); });
  }

  /* ----------------------------------------------------------
     4. ヒーロー動画(TOP=REVISION_SPEC §A-2 / 店舗=STORE_CV_SPEC §6)
        TOPヒーローと店舗ヒーローを同一制御(data属性で汎用化)。
        <video data-video-src="…"> に src を付けず置いておき、
        window load 後に <source> を注入して再生する。
        LCP はポスター静止画(<picture> / <img>)で確定させる。
        再生しない条件(ガード):
          - prefers-reduced-motion: reduce
          - navigator.connection.saveData === true
          - <video> 非対応 / mp4 再生不可
        再生開始後は IntersectionObserver で画面外に出たら pause
     ---------------------------------------------------------- */
  var heroVideos = document.querySelectorAll(
    '.hero-media video[data-video-src], .store-hero__media video[data-video-src]'
  );
  heroVideos.forEach(function (heroVideo) {
    var conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    var saveData = !!(conn && conn.saveData === true);
    var canPlayMp4 = typeof heroVideo.canPlayType === 'function' &&
                     heroVideo.canPlayType('video/mp4') !== '';

    if (!prefersReduced && !saveData && canPlayMp4) {
      var startHeroVideo = function () {
        if (heroVideo.dataset.videoLoaded) { return; }
        heroVideo.dataset.videoLoaded = '1';

        var source = document.createElement('source');
        source.src = heroVideo.getAttribute('data-video-src');
        source.type = 'video/mp4';
        heroVideo.appendChild(source);
        heroVideo.load();

        heroVideo.addEventListener('playing', function () {
          heroVideo.classList.add('is-playing');
        });

        var tryPlay = function () {
          var p = heroVideo.play();
          if (p && typeof p.catch === 'function') {
            /* 自動再生がブロックされたらポスター静止画のまま(エラーにしない) */
            p.catch(function () {});
          }
        };
        tryPlay();

        /* 画面外では止める(バッテリー/CPU配慮)。再入で再生 */
        if ('IntersectionObserver' in window) {
          var videoIo = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) { tryPlay(); }
              else if (!heroVideo.paused) { heroVideo.pause(); }
            });
          }, { threshold: 0.1 });
          videoIo.observe(heroVideo);
        }
      };

      if (document.readyState === 'complete') {
        startHeroVideo();
      } else {
        window.addEventListener('load', startHeroVideo, { once: true });
      }
    }
  });

  /* ----------------------------------------------------------
     5. 遅延iframe(地図): data-src を IO で src に昇格
        <iframe data-src="…" loading="lazy"> に対応
     ---------------------------------------------------------- */
  var lazyFrames = document.querySelectorAll('iframe[data-src]');
  if (lazyFrames.length) {
    if ('IntersectionObserver' in window) {
      var frameIo = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var f = entry.target;
            f.src = f.getAttribute('data-src');
            f.removeAttribute('data-src');
            frameIo.unobserve(f);
          }
        });
      }, { rootMargin: '900px 0px' }); /* 高速スクロールでも空枠が見えないよう先読みを拡大(VISUAL_AUDIT2 M-1) */
      lazyFrames.forEach(function (f) { frameIo.observe(f); });
    } else {
      lazyFrames.forEach(function (f) {
        f.src = f.getAttribute('data-src');
        f.removeAttribute('data-src');
      });
    }
  }

  /* ----------------------------------------------------------
     6. GA4イベント計測(REVISION_SPEC §D)
        gtag が読み込まれている場合のみ送信。store は
        リンク自身 or 祖先要素の data-store 属性から取得。
        - tel_tap:     tel: リンク(店舗別)
        - reserve_cta: 自社予約導線(/reservation/ または #reserve)
        ※HPB(ホットペッパー)導線は全廃済みのため計測しない
     ---------------------------------------------------------- */
  function trackEvent(name, params) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, params);
    }
  }

  function storeOf(link) {
    var holder = link.closest('[data-store]');
    return holder ? holder.getAttribute('data-store') : 'unknown';
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href]');
    if (!link) { return; }
    var href = link.getAttribute('href') || '';

    if (href.indexOf('tel:') === 0) {
      trackEvent('tel_tap', { store: storeOf(link), tel: href.replace('tel:', '') });
    } else if (href.indexOf('#reserve') !== -1 || /(^|\/)reservation\/?(#.*)?$/.test(href)) {
      trackEvent('reserve_cta', { store: storeOf(link) });
    }
  }, { passive: true });
})();
