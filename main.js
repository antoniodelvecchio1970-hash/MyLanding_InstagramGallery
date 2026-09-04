document.addEventListener("DOMContentLoaded", () => {
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isMobile = window.innerWidth < 768;

  // 1. Initialize Lenis Smooth Scroll (Hardware-friendly for mobile touch)
  const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    smoothWheel: true,
    syncTouch: false, // native momentum scrolling on mobile touch
    touchMultiplier: 1.0
  });

  // Connect Lenis cleanly to GSAP ScrollTrigger
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  // 2. Setup Canvas & 59 Frame Sequence Preloading
  const canvas = document.getElementById("hero-canvas");
  const ctx = canvas.getContext("2d");

  const frameCount = 59; // frame_000 to frame_058
  // Mobile loads the ~1.3MB WebP sequence; desktop loads the full-resolution sequence
  const currentFrame = (index) => {
    const pad = index.toString().padStart(3, '0');
    return isMobile
      ? `assets/sequence_mob/frame_${pad}.webp`
      : `assets/sequence/frame_${pad}.jpg`;
  };

  const images = new Array(frameCount);
  const sequence = { frame: 0 };
  let lastRenderedIndex = -1;

  // Frame preloader with priority & auto-refresh
  function loadFrame(i, priority = 'auto') {
    if (images[i]) return images[i];
    const img = new Image();
    if (priority === 'high' && 'fetchPriority' in img) {
      img.fetchPriority = 'high';
    }
    img.src = currentFrame(i);
    img.onload = () => {
      const currentTarget = Math.min(frameCount - 1, Math.max(0, Math.floor(sequence.frame)));
      if (lastRenderedIndex === -1 || Math.abs(i - currentTarget) <= Math.abs(lastRenderedIndex - currentTarget)) {
        render();
      }
    };
    images[i] = img;
    return img;
  }

  // Priority 1: Load Frame 0 immediately and render as soon as ready
  const frame0 = loadFrame(0, 'high');
  if (frame0.complete) {
    render();
  } else {
    frame0.onload = render;
  }

  // Draw image inside canvas with 'object-fit: cover' logic
  function drawCoverImage(img) {
    if (!img || !img.complete || img.naturalWidth === 0) return false;

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    const canvasRatio = canvasWidth / canvasHeight;
    const imgRatio = imgWidth / imgHeight;

    let drawWidth, drawHeight, offsetX, offsetY;

    if (canvasRatio > imgRatio) {
      drawWidth = canvasWidth;
      drawHeight = canvasWidth / imgRatio;
      offsetX = 0;
      offsetY = (canvasHeight - drawHeight) / 2;
    } else {
      drawWidth = canvasHeight * imgRatio;
      drawHeight = canvasHeight;
      offsetX = (canvasWidth - drawWidth) / 2;
      offsetY = 0;

      // On mobile portrait (canvasRatio < 0.8), shift monkeys slightly to the left (~3.5% of drawWidth)
      // to give them more visibility and balance the composition
      if (canvasRatio < 0.8) {
        offsetX -= drawWidth * 0.035;
      }
    }

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.filter = 'none';
    ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    return true;
  }

  function render() {
    const targetIndex = Math.min(frameCount - 1, Math.max(0, Math.floor(sequence.frame)));

    // Ensure target frame and surrounding buffer frames are queued
    loadFrame(targetIndex);
    for (let offset = 1; offset <= 3; offset++) {
      if (targetIndex + offset < frameCount) loadFrame(targetIndex + offset);
      if (targetIndex - offset >= 0) loadFrame(targetIndex - offset);
    }

    // Try rendering target frame
    if (images[targetIndex] && drawCoverImage(images[targetIndex])) {
      lastRenderedIndex = targetIndex;
      return;
    }

    // Fallback: draw nearest loaded frame to prevent freeze or blank screen
    let closestIndex = -1;
    let minDistance = Infinity;
    for (let i = 0; i < frameCount; i++) {
      if (images[i] && images[i].complete && images[i].naturalWidth > 0) {
        const dist = Math.abs(i - targetIndex);
        if (dist < minDistance) {
          minDistance = dist;
          closestIndex = i;
        }
      }
    }

    if (closestIndex !== -1) {
      drawCoverImage(images[closestIndex]);
      lastRenderedIndex = closestIndex;
    }
  }

  // Progressive background preloader in non-blocking batches
  function preloadRemaining() {
    let nextIdx = 1;
    function loadNextBatch() {
      const batchSize = isMobile ? 4 : 8;
      const end = Math.min(frameCount, nextIdx + batchSize);
      for (let i = nextIdx; i < end; i++) {
        loadFrame(i);
      }
      nextIdx = end;
      if (nextIdx < frameCount) {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(loadNextBatch, { timeout: 200 });
        } else {
          setTimeout(loadNextBatch, 50);
        }
      }
    }
    loadNextBatch();
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(preloadRemaining, { timeout: 300 });
  } else {
    setTimeout(preloadRemaining, 100);
  }

  // Canvas resize with DPR capped at 2 to conserve mobile GPU memory
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    render();
  }

  let lastWidth = window.innerWidth;
  window.addEventListener("resize", () => {
    // Prevent mobile URL bar show/hide height changes from resetting canvas
    if (Math.abs(window.innerWidth - lastWidth) > 10) {
      lastWidth = window.innerWidth;
      resizeCanvas();
    }
  });
  resizeCanvas();

  // 3. Register GSAP ScrollTrigger & Connect Scroll scrubbing to Hero Canvas sequence
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  gsap.to(sequence, {
    frame: frameCount - 1,
    snap: "frame",
    ease: "none",
    scrollTrigger: {
      trigger: ".hero-sequence-container",
      start: "top top",
      end: "bottom bottom",
      scrub: isMobile ? 0.3 : 0.5,
      invalidateOnRefresh: true
    },
    onUpdate: render
  });

  // 4. Full-Screen Immersive Capabilities ScrollTrigger Timeline (With End Hold State)
  const capTL = gsap.timeline({
    scrollTrigger: {
      trigger: ".cap-pin-wrapper",
      start: "top top",
      end: "bottom bottom",
      scrub: 0.5,
      onUpdate: (self) => {
        const progress = Math.min(100, Math.max(0, self.progress * 100));
        const progressEl = document.getElementById("cap-progress");
        if (progressEl) progressEl.style.width = progress + "%";

        const counterEl = document.getElementById("cap-counter");
        if (counterEl) {
          if (self.progress < 0.33) {
            counterEl.textContent = "01 / 03";
          } else if (self.progress < 0.66) {
            counterEl.textContent = "02 / 03";
          } else {
            counterEl.textContent = "03 / 03";
          }
        }
      }
    }
  });

  // Opacità fissa hardware-accelerated
  gsap.set(".cap-img", { opacity: 1 });

  capTL
    // TRANSITION 1 -> 2
    .to(".cap-img-1", { clipPath: "inset(0% 0% 100% 0%)", ease: "none", duration: 1 }, 1)
    .to(".cap-text-1", { opacity: 0, y: -20, pointerEvents: "none", duration: 0.5, ease: "power1.inOut" }, 1)
    .to(".cap-text-2", { opacity: 1, y: 0, pointerEvents: "auto", duration: 0.5, ease: "power1.inOut" }, 1.3)

    // HOLD STATE INTERMEDIO (Pausa sullo Step 2)
    .to({}, { duration: 1.5 })

    // TRANSITION 2 -> 3
    .to(".cap-img-2", { clipPath: "inset(0% 0% 100% 0%)", ease: "none", duration: 1 }, 3.5)
    .to(".cap-text-2", { opacity: 0, y: -20, pointerEvents: "none", duration: 0.5, ease: "power1.inOut" }, 3.5)
    .to(".cap-text-3", { opacity: 1, y: 0, pointerEvents: "auto", duration: 0.5, ease: "power1.inOut" }, 3.8)

    // HOLD STATE FINALE RIGIDO
    .to({}, { duration: 2.5 });

  // 5. Concept Lightbox Modal Logic
  const modal = document.getElementById("concept-modal");
  const modalClose = document.getElementById("modal-close");
  const modalImg = document.getElementById("modal-img");
  const modalCategory = document.getElementById("modal-category");
  const modalTitle = document.getElementById("modal-title");
  const modalDesc = document.getElementById("modal-desc");
  const modalSpecs = document.getElementById("modal-specs");
  const modalLikes = document.getElementById("modal-likes");

  function openModal(card) {
    if (!modal) return;
    const title = card.getAttribute("data-title") || "";
    const category = card.getAttribute("data-category") || "";
    const caption = card.getAttribute("data-caption") || card.getAttribute("data-desc") || "";
    const specs = card.getAttribute("data-specs") || "";
    const img = card.getAttribute("data-img") || "";
    const likes = card.getAttribute("data-likes") || "1.2k";

    if (modalImg) modalImg.src = img;
    if (modalCategory) modalCategory.textContent = category;
    if (modalTitle) modalTitle.textContent = title;
    if (modalDesc) modalDesc.textContent = caption;
    if (modalSpecs) modalSpecs.textContent = specs;
    if (modalLikes) modalLikes.textContent = likes;

    modal.classList.remove("hidden");
    requestAnimationFrame(() => {
      modal.classList.remove("opacity-0");
    });
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add("opacity-0");
    setTimeout(() => {
      modal.classList.add("hidden");
      document.body.style.overflow = "";
    }, 400);
  }

  document.querySelectorAll(".editorial-card").forEach(card => {
    card.addEventListener("click", () => openModal(card));
  });

  if (modalClose) {
    modalClose.addEventListener("click", closeModal);
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) {
      closeModal();
    }
  });

  // 6. Contact Form Anti-Bot & Submit Handler
  const pageRenderTime = Date.now();
  const contactForm = document.getElementById("contact-form");
  const contactSubmitBtn = document.getElementById("contact-submit-btn");
  const contactBtnText = document.getElementById("contact-btn-text");
  const contactFeedback = document.getElementById("contact-feedback");

  if (contactForm) {
    contactForm.addEventListener("submit", (e) => {
      e.preventDefault();

      if (contactFeedback) {
        contactFeedback.classList.add("hidden");
        contactFeedback.className = "hidden mb-4 p-3 rounded-none text-xs font-semibold text-center tracking-wider uppercase";
      }

      // Honeypot Trap check
      const honeypotVal = document.getElementById("b_website_hp") ? document.getElementById("b_website_hp").value : "";
      if (honeypotVal !== "") {
        showFormSuccess();
        contactForm.reset();
        return;
      }

      // Temporal Verifier check (< 2.5 seconds)
      if ((Date.now() - pageRenderTime) < 2500) {
        showFormSuccess();
        contactForm.reset();
        return;
      }

      // Local Rate Limiting check (60 seconds)
      const lastSubmit = localStorage.getItem("contact_last_submit");
      if (lastSubmit) {
        const timeDiff = Date.now() - parseInt(lastSubmit, 10);
        if (timeDiff < 60000) {
          const secondsLeft = Math.ceil((60000 - timeDiff) / 1000);
          showFormError(`ATTENDI ${secondsLeft} SECONDI PRIMA DI INVIARE UN ALTRO MESSAGGIO.`);
          return;
        }
      }

      // Successful Submission
      localStorage.setItem("contact_last_submit", Date.now().toString());
      showFormSuccess();
      contactForm.reset();
    });
  }

  function showFormSuccess() {
    if (contactFeedback) {
      contactFeedback.textContent = "MESSAGGIO INVIATO CON SUCCESSO";
      contactFeedback.className = "mb-4 p-3 rounded-none text-xs font-semibold text-center tracking-wider uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 block";
    }
    if (contactBtnText) {
      contactBtnText.textContent = "MESSAGGIO INVIATO!";
    }
    setTimeout(() => {
      if (contactBtnText) contactBtnText.textContent = "INVIA MESSAGGIO";
      if (contactFeedback) {
        setTimeout(() => {
          contactFeedback.classList.add("hidden");
        }, 4000);
      }
    }, 3000);
  }

  function showFormError(msg) {
    if (contactFeedback) {
      contactFeedback.textContent = msg;
      contactFeedback.className = "mb-4 p-3 rounded-none text-xs font-semibold text-center tracking-wider uppercase bg-amber-100 text-amber-800 border border-amber-300 block";
    }
  }

  // 7. SIMULTANEOUS ANIMATED COUNTERS ON SCROLL
  const statsBar = document.getElementById("profile-stats-bar");
  const counterDaysEl = document.getElementById("counter-days");
  const counterYearsEl = document.getElementById("counter-years");
  const counterVisionEl = document.getElementById("counter-vision");

  if (statsBar && counterDaysEl && counterYearsEl && counterVisionEl) {
    const startDate = new Date("1991-01-01");
    const today = new Date();
    const targetDays = Math.floor(Math.abs(today - startDate) / (1000 * 60 * 60 * 24));
    const targetYears = 30;
    const targetVision = 360;

    let hasAnimated = false;

    const animateCounters = () => {
      if (hasAnimated) return;
      hasAnimated = true;

      const duration = 2200;
      const startTime = performance.now();

      const updateCount = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        const currentDays = Math.floor(1 + (targetDays - 1) * easeProgress);
        counterDaysEl.textContent = currentDays.toLocaleString("it-IT");

        const currentYears = Math.floor(1 + (targetYears - 1) * easeProgress);
        counterYearsEl.textContent = `${currentYears}+`;

        const currentVision = Math.floor(1 + (targetVision - 1) * easeProgress);
        counterVisionEl.textContent = `${currentVision}°`;

        if (progress < 1) {
          requestAnimationFrame(updateCount);
        } else {
          counterDaysEl.textContent = targetDays.toLocaleString("it-IT");
          counterYearsEl.textContent = `${targetYears}+`;
          counterVisionEl.textContent = `${targetVision}°`;
        }
      };

      requestAnimationFrame(updateCount);
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCounters();
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });

    observer.observe(statsBar);
  }
});
