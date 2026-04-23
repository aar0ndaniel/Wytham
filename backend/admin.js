document.addEventListener('DOMContentLoaded', () => {
  const panelStorageKey = 'metis-admin-active-panel';
  const buttons = Array.from(document.querySelectorAll('[data-panel-target]'));
  const panels = Array.from(document.querySelectorAll('[data-panel]'));
  const rowSelects = Array.from(document.querySelectorAll('[data-row-select]'));
  const selectAll = document.querySelector('[data-select-all]');
  const selectionCount = document.querySelector('[data-selection-count]');
  const batchForm = document.querySelector('[data-batch-form]');
  const selectedTokensInput = document.querySelector('[data-selected-tokens]');
  const batchDeleteButton = document.querySelector('[data-batch-delete]');

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
    window.sessionStorage.setItem(panelStorageKey, targetId);
  };

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      setActivePanel(button.getAttribute('data-panel-target'));
    });
  });

  const syncBatchSelection = () => {
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
    if (batchDeleteButton instanceof HTMLButtonElement) {
      batchDeleteButton.disabled = selectedCount === 0;
    }
  };

  if (selectAll instanceof HTMLInputElement) {
    selectAll.addEventListener('change', () => {
      rowSelects.forEach((input) => {
        input.checked = selectAll.checked;
      });
      syncBatchSelection();
    });
  }

  rowSelects.forEach((input) => {
    input.addEventListener('change', syncBatchSelection);
  });

  if (batchForm instanceof HTMLFormElement) {
    batchForm.addEventListener('submit', (event) => {
      syncBatchSelection();
      if (!(selectedTokensInput instanceof HTMLInputElement) || !selectedTokensInput.value) {
        event.preventDefault();
        return;
      }

      const message = batchForm.getAttribute('data-confirm-selected');
      if (message && !window.confirm(message)) {
        event.preventDefault();
      }
    });
  }

  const savedPanel = window.sessionStorage.getItem(panelStorageKey);
  if (savedPanel && panels.some((panel) => panel.id === savedPanel)) {
    setActivePanel(savedPanel);
  }

  syncBatchSelection();
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
