# Toast feedback

Server actions finish with `redirect(path?saved=<message>)` (`finish()` in `src/app/dashboard/form-state.ts`). The page reads `saved` and passes it to `Flash`.

- **Saved** results show as a Sonner toast (`src/components/ui/sonner.tsx`, mounted once in the root layout). `Flash` fires the toast on mount, then removes `saved` from the URL so a refresh does not repeat it.
- **Errors** stay as an inline destructive `Alert` at the top of the page. They need to stay visible while the user fixes the form, and filter validation errors come from the GET query rather than an action.
- The toaster follows the app theme by watching the `dark` class on `<html>`, since the app does not use `next-themes`.
