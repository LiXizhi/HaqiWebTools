// Keep the result action responsive while async pet loading and persistence finish.
export function bindResultSettlement(control, finish, write, showError, clearError = () => {}) {
    const label = control.textContent;
    let waiting = false;
    control.onclick = async () => {
        if (waiting) return;
        waiting = true;
        clearError();
        control.disabled = true;
        control.setAttribute('aria-busy', 'true');
        write(control, '正在结算…');
        try {
            await finish();
        } catch (error) {
            if (control.isConnected) showError(error);
        } finally {
            waiting = false;
            if (control.isConnected) {
                control.disabled = false;
                control.removeAttribute('aria-busy');
                control.textContent = label;
            }
        }
    };
}
