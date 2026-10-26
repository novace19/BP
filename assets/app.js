'use strict';
document.addEventListener('submit', (event) => {
    const form = event.target;
    if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) {
        event.preventDefault();
        return;
    }
    // Ochrana proti dvojkliku; hlavní validace a kontrola kapacity probíhá na serveru.
    for (const button of form.querySelectorAll('button[type="submit"], button:not([type])')) {
        button.disabled = true;
    }
});
