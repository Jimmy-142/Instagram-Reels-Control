'use strict';

let enabled = true;
let stopFn = null;

// -----------------------------
// STATE SYSTEM
// -----------------------------
chrome.storage.local.get(["igFixEnabled"], (res) => {
    enabled = res.igFixEnabled ?? true;

    if (enabled) start();
});

chrome.storage.onChanged.addListener((changes) => {
    if (changes.igFixEnabled) {
        enabled = changes.igFixEnabled.newValue;

        if (enabled) {
            start();
        } else {
            stop();

            // // 🔥 reload AFTER stop cleanup
            // setTimeout(() => {
            //     location.reload();
            // }, 50);
        }
    }
});

// -----------------------------
// CORE FUNCTIONS (NOW GLOBAL)
// -----------------------------

let observer = null;
let intervals = [];
let running = false;

const processed = new WeakSet();
const videoState = new WeakMap();

function start() {
    if (running) return;
    running = true;

    function patchVideo(video) {

        if (processed.has(video)) return;
        processed.add(video);

        video.controls = true;

        videoState.set(video, {
            userMuted: false
        });

        video.addEventListener("click", e => e.stopPropagation(), true);
        video.addEventListener("mousedown", e => e.stopPropagation(), true);

        let hideTimer = null;

        function showControls() {
            clearTimeout(hideTimer);
            video.controls = true;
        }

        function hideControls() {
            clearTimeout(hideTimer);

            hideTimer = setTimeout(() => {
                if (!video.matches(':hover')) {
                    video.controls = false;
                }
            }, 1200);
        }

        video.addEventListener('mouseenter', showControls);
        video.addEventListener('mousemove', showControls);
        video.addEventListener('mouseleave', hideControls);

        const state = videoState.get(video);

        if (!state || !state.userMuted) {
            video.muted = false;
        }

        function enforceAudioState() {
            if (!video.isConnected) return;

            if (video.muted && !videoState.get(video)?.userMuted) {
                video.muted = false;
            }

            if (video.volume === 0 && !videoState.get(video)?.userMuted) {
                video.volume = 1;
            }
        }

        enforceAudioState();

        const interval = setInterval(() => {
            if (!document.body.contains(video)) {
                clearInterval(interval);
                return;
            }
            enforceAudioState();
        }, 10);

        intervals.push(interval);
    }

    function fixInstagram() {
        document.querySelectorAll('video').forEach(patchVideo);

        document.querySelectorAll('div[aria-label="Video player"]').forEach(el => {
            el.style.pointerEvents = 'none';
        });
    }

    fixInstagram();

    observer = new MutationObserver(fixInstagram);
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    function getActiveVideo() {

        const videos = [...document.querySelectorAll("video")];

        return videos.find(v => {
            const r = v.getBoundingClientRect();

            return (
                r.width > 100 &&
                r.height > 100 &&
                r.bottom > 0 &&
                r.top < window.innerHeight
            );
        });
    }

    document.addEventListener("keydown", e => {

        if (
            e.target instanceof HTMLInputElement ||
            e.target instanceof HTMLTextAreaElement
        ) return;

        const video = getActiveVideo();
        if (!video) return;

        // ---------------------------------------
        // SPACE → play / pause
        // ---------------------------------------
        if (e.code === "Space") {
            if (video.paused) {
                video.play().catch(() => { });
            } else {
                video.pause();
            }

            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // ---------------------------------------
        // M → mute toggle (your existing logic)
        // ---------------------------------------
        if (e.key.toLowerCase() === "m") {

            const newMuted = !video.muted;
            video.muted = newMuted;

            const state = videoState.get(video);
            if (state) state.userMuted = newMuted;

            e.preventDefault();
            e.stopPropagation();
        }

        if (e.code === "ArrowRight") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();

            video.currentTime = Math.min(
                video.duration || Infinity,
                video.currentTime + 5
            );
            return;
        }

        if (e.code === "ArrowLeft") {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();

            const targetTime = video.currentTime - 5;

            // -------------------------------
            // 🧠 find buffered range support
            // -------------------------------
            try {
                const buffered = video.buffered;

                let minSeek = 0;

                for (let i = 0; i < buffered.length; i++) {
                    if (buffered.start(i) <= video.currentTime &&
                        buffered.end(i) >= video.currentTime) {
                        minSeek = buffered.start(i);
                        break;
                    }
                }

                const clampedTime = Math.max(targetTime, minSeek);

                video.currentTime = clampedTime;

                // -------------------------------
                // 🔁 fallback retry (fixes Instagram clamp)
                // -------------------------------
                setTimeout(() => {
                    if (Math.abs(video.currentTime - clampedTime) > 0.5) {
                        video.currentTime = clampedTime;
                    }
                }, 100);

            } catch {
                // fallback if buffered API unavailable
                video.currentTime = Math.max(0, targetTime);
            }

            return;
        }

    }, true);

    stopFn = () => {
        document.removeEventListener("keydown", keyHandler, true);

        if (observer) observer.disconnect();
        observer = null;

        intervals.forEach(clearInterval);
        intervals = [];

        processed.clear();

        running = false;
    };
}

function stop() {
    if (stopFn) stopFn();
}

// debug
window.__igFix = { start, stop };