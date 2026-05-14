document.addEventListener('DOMContentLoaded', () => {
  const panelStorageKey = 'metis-admin-active-panel';
  const buttons = Array.from(document.querySelectorAll('[data-panel-target]'));
  const panels = Array.from(document.querySelectorAll('[data-panel]'));
  const exportLinks = Array.from(document.querySelectorAll('[data-export-link]'));
  const batchForms = Array.from(document.querySelectorAll('[data-batch-form]'));

  const syncExportLinks = (targetId) => {
    const panel = panels.find((item) => item.id === targetId) || panels.find((item) => item.classList.contains('is-active'));
    const href = panel?.getAttribute('data-export-href') || '/admin/export/signups.csv';
    const label = panel?.getAttribute('data-export-label') || 'Export signups CSV';

    exportLinks.forEach((link) => {
      link.setAttribute('href', href);
      link.setAttribute('aria-label', label);
      link.setAttribute('title', label);
      const textTarget = link.querySelector('[data-export-text]');
      if (textTarget) {
        textTarget.textContent = label;
      }
    });
  };

  const setActivePanel = (targetId) => {
    if (!targetId) return;
    buttons.forEach((item) => {
      const active = item.getAttribute('data-panel-target') === targetId;
      item.classList.toggle('is-active', active);
      item.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    panels.forEach((panel) => {
      panel.classList.toggle('is-active', panel.id === targetId);
    });
    syncExportLinks(targetId);
    window.sessionStorage.setItem(panelStorageKey, targetId);
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      setActivePanel(button.getAttribute('data-panel-target'));
    });
  });

  const syncBatchSelection = (panel) => {
    if (!(panel instanceof HTMLElement)) return;
    const rowSelects = Array.from(panel.querySelectorAll('[data-row-select]'));
    const selectAll = panel.querySelector('[data-select-all]');
    const selectionCount = panel.querySelector('[data-selection-count]');
    const selectedTokensInput = panel.querySelector('[data-selected-tokens]');
    const batchButtons = Array.from(panel.querySelectorAll('[data-batch-action]'));
    const selected = rowSelects.filter((input) => input.checked);
    const selectedCount = selected.length;
    const allSelected = rowSelects.length > 0 && selectedCount === rowSelects.length;

    if (selectAll instanceof HTMLInputElement) {
      selectAll.checked = allSelected;
      selectAll.indeterminate = selectedCount > 0 && !allSelected;
    }
    if (selectionCount) {
      selectionCount.textContent = `${selectedCount} selected`;
    }
    if (selectedTokensInput instanceof HTMLInputElement) {
      selectedTokensInput.value = selected.map((input) => input.value).join(',');
    }
    batchButtons.forEach((button) => {
      if (button instanceof HTMLButtonElement) {
        button.disabled = selectedCount === 0;
      }
    });
  };

  panels.forEach((panel) => {
    const rowSelects = Array.from(panel.querySelectorAll('[data-row-select]'));
    const selectAll = panel.querySelector('[data-select-all]');

    if (selectAll instanceof HTMLInputElement) {
      selectAll.addEventListener('change', () => {
        rowSelects.forEach((input) => {
          input.checked = selectAll.checked;
        });
        syncBatchSelection(panel);
      });
    }

    rowSelects.forEach((input) => {
      input.addEventListener('change', () => syncBatchSelection(panel));
    });

    syncBatchSelection(panel);
  });

  batchForms.forEach((batchForm) => {
    batchForm.addEventListener('submit', (event) => {
      const panel = batchForm.closest('[data-panel]');
      syncBatchSelection(panel);
      const selectedTokensInput = panel?.querySelector('[data-selected-tokens]');
      if (!(selectedTokensInput instanceof HTMLInputElement) || !selectedTokensInput.value) {
        event.preventDefault();
        return;
      }

      const message = batchForm.getAttribute('data-confirm-selected');
      if (message && !window.confirm(message)) {
        event.preventDefault();
      }
    });
  });

  const savedPanel = window.sessionStorage.getItem(panelStorageKey);
  if (savedPanel && panels.some((panel) => panel.id === savedPanel)) {
    setActivePanel(savedPanel);
  } else {
    syncExportLinks('signups-panel');
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.hasAttribute('data-batch-form')) return;

  const message = form.getAttribute('data-confirm');
  if (message && !window.confirm(message)) {
    event.preventDefault();
  }
});
