// Simple UI interaction logic for demo purposes
function focusSidebar(varName) {
    if (varName === 'industry' || varName === 'specific pain point') {
        const inputId = `input-${varName.replace(/ /g, '-')}`;
        const el = document.getElementById(inputId);
        if (el) {
            el.focus();
            // Flash the input to draw attention
            el.classList.add('ring-2', 'ring-accent', 'border-accent');
            setTimeout(() => {
                el.classList.remove('ring-2', 'ring-accent', 'border-accent');
            }, 600);
        }
    }
}
