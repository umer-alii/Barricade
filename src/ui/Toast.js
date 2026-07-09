/**
 * Toast Notifications Manager
 */

export class Toast {
  /**
   * @param {string} containerId - DOM container ID for toasts
   */
  constructor(containerId = 'toast-container') {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = containerId;
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    }
  }

  /**
   * Show a toast message with slide-in and auto-dismiss behavior
   * @param {string} message
   */
  show(message) {
    // Avoid duplicating exactly identical toasts if they are already visible
    const existing = Array.from(this.container.children).some(
      child => child.querySelector('.toast-text')?.textContent === message
    );
    if (existing) return;

    const toast = document.createElement('div');
    toast.className = 'toast-item';

    const textSpan = document.createElement('span');
    textSpan.className = 'toast-text';
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    const closeButton = document.createElement('button');
    closeButton.className = 'toast-close-btn';
    closeButton.innerHTML = '&times;';
    closeButton.setAttribute('aria-label', 'Close notification');
    closeButton.addEventListener('click', () => {
      this.dismiss(toast);
    });
    toast.appendChild(closeButton);

    this.container.appendChild(toast);

    // Auto-dismiss after 3.5 seconds
    const timeoutId = setTimeout(() => {
      this.dismiss(toast);
    }, 3500);

    // Attach timeout ID to element so it can be cleared if dismissed manually
    toast.dataset.timeoutId = timeoutId;
  }

  /**
   * Fade out and remove a toast item
   * @param {HTMLElement} toast
   */
  dismiss(toast) {
    if (toast.dataset.timeoutId) {
      clearTimeout(parseInt(toast.dataset.timeoutId, 10));
    }

    if (!toast.classList.contains('dismissing')) {
      toast.classList.add('dismissing');
      toast.addEventListener('transitionend', () => {
        toast.remove();
      });
      
      // Safety fallback in case transition event is missed
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 400);
    }
  }
}
