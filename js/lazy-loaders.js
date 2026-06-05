/**
 * ════════════════════════════════════════════════════════════════
 * Lazy Loader Module — Dynamic Library Loading on Demand
 * ════════════════════════════════════════════════════════════════
 * 
 * Loads XLSX and PDF.js libraries only when features are actually used.
 * Prevents blocking page load, improves initial performance.
 */

const LazyLoaders = {
  // Track loading state
  _loading: {},
  _loaded: {},

  /**
   * Load XLSX library (used for Excel export)
   * @returns {Promise} Resolves when XLSX is available
   */
  loadXLSX() {
    return this._loadLibrary(
      'xlsx',
      'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
      () => typeof XLSX !== 'undefined'
    );
  },

  /**
   * Load PDF.js library (used for PDF analysis)
   * @returns {Promise} Resolves when pdf.js is available
   */
  loadPDFJS() {
    return this._loadLibrary(
      'pdfjs',
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
      () => typeof pdfjsLib !== 'undefined'
    );
  },

  /**
   * Generic library loader with caching & deduplication
   * @private
   * @param {string} name - Library identifier
   * @param {string} url - CDN URL
   * @param {Function} checkFn - Function to verify library is loaded
   * @returns {Promise}
   */
  _loadLibrary(name, url, checkFn) {
    // Already loaded? Return immediately
    if (this._loaded[name]) {
      return Promise.resolve();
    }

    // Already loading? Return existing promise
    if (this._loading[name]) {
      return this._loading[name];
    }

    // Start new load
    this._loading[name] = new Promise((resolve, reject) => {
      // Double-check it didn't load in between
      if (checkFn()) {
        this._loaded[name] = true;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = url;
      script.async = true;
      
      script.onload = () => {
        if (checkFn()) {
          this._loaded[name] = true;
          resolve();
        } else {
          reject(new Error(`Library ${name} failed to initialize after loading`));
        }
      };

      script.onerror = () => {
        delete this._loading[name];
        reject(new Error(`Failed to load library from ${url}`));
      };

      // Add script to document
      const target = document.head || document.documentElement;
      target.appendChild(script);
    });

    return this._loading[name];
  },

  /**
   * Preload libraries in background (non-blocking)
   * Call this after page interactive time
   */
  preloadAll() {
    // Load XLSX after 2 seconds
    setTimeout(() => {
      this.loadXLSX().catch(err => {
        console.warn('XLSX preload failed:', err.message);
      });
    }, 2000);

    // Load PDF.js after 3 seconds
    setTimeout(() => {
      this.loadPDFJS().catch(err => {
        console.warn('PDF.js preload failed:', err.message);
      });
    }, 3000);
  },

  /**
   * Wrapper for XLSX operations with auto-loading
   * @param {Function} callback - Function that uses XLSX
   * @returns {Promise}
   */
  withXLSX(callback) {
    return this.loadXLSX()
      .then(callback)
      .catch(err => {
        const msg = 'حدث خطأ في تحميل مكتبة Excel. تحقق من الاتصال بالإنترنت.';
        console.error(msg, err);
        if (typeof toast === 'function') {
          toast(msg, 'error');
        }
        throw err;
      });
  },

  /**
   * Wrapper for PDF.js operations with auto-loading
   * @param {Function} callback - Function that uses pdf
   * @returns {Promise}
   */
  withPDFJS(callback) {
    return this.loadPDFJS()
      .then(callback)
      .catch(err => {
        const msg = 'حدث خطأ في تحميل مكتبة PDF. تحقق من الاتصال بالإنترنت.';
        console.error(msg, err);
        if (typeof toast === 'function') {
          toast(msg, 'error');
        }
        throw err;
      });
  }
};

/**
 * Initialize lazy loading:
 * - Start preloading libraries after page is interactive
 * - Use requestIdleCallback if available, otherwise setTimeout
 */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => LazyLoaders.preloadAll());
    } else {
      setTimeout(() => LazyLoaders.preloadAll(), 1000);
    }
  });
} else {
  // Already interactive
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => LazyLoaders.preloadAll());
  } else {
    setTimeout(() => LazyLoaders.preloadAll(), 500);
  }
}

// Expose globally
window.LazyLoaders = LazyLoaders;
