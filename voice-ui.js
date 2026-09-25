(function () {
  const preferenceKey = 'hangon.voice';
  const fallbackVoices = [
    { id: 'anna', label: 'Anna (British)' },
    { id: 'michael', label: 'Michael (US)' },
    { id: 'jane', label: 'Jane (US)' },
    { id: 'alba', label: 'Alba (US)' }
  ];

  function readSaved(voices) {
    try {
      const saved = localStorage.getItem(preferenceKey);
      return voices.some((voice) => voice.id === saved) ? saved : voices[0].id;
    } catch {
      return voices[0].id;
    }
  }

  function mount(placement) {
    if (!placement || document.querySelector('#voiceChoice')) return null;
    const wrapper = document.createElement('div');
    wrapper.className = 'voice-setting';
    const label = document.createElement('label');
    label.htmlFor = 'voiceChoice';
    label.textContent = 'Voice for this call';
    const select = document.createElement('select');
    select.id = 'voiceChoice';
    select.setAttribute('aria-label', 'Voice for this call');
    wrapper.append(label, select);
    placement.append(wrapper);

    let voices = fallbackVoices;
    function setVoices(nextVoices, defaultVoice) {
      voices = Array.isArray(nextVoices) && nextVoices.length ? nextVoices : fallbackVoices;
      select.replaceChildren(...voices.map((voice) => {
        const option = document.createElement('option');
        option.value = voice.id;
        option.textContent = voice.label;
        return option;
      }));
      const chosen = voices.some((voice) => voice.id === defaultVoice) ? defaultVoice : readSaved(voices);
      select.value = chosen;
    }
    select.addEventListener('change', () => {
      try { localStorage.setItem(preferenceKey, select.value); } catch {}
    });
    setVoices(voices);
    return {
      element: select,
      setVoices,
      getVoice: () => select.value,
      setDisabled: (disabled) => { select.disabled = disabled; }
    };
  }

  window.HangOnVoice = { mount };
}());
