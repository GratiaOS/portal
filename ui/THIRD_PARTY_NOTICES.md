# Third-party notices

The page is MPL-2.0 (see `LICENSE`). What its build (`ui/dist`) carries from others, all under the MIT License:

| Package | Version | Licence | In the build |
| --- | --- | --- | --- |
| [react](https://github.com/facebook/react) | 19.3.0 | MIT | the script |
| [react-dom](https://github.com/facebook/react) | 19.3.0 | MIT | the script |
| [scheduler](https://github.com/facebook/react) | 0.28.0 | MIT | the script |
| [tailwindcss](https://github.com/tailwindlabs/tailwindcss) | 4.3.3 | MIT | the stylesheet's base layer |

Their licence notices stay in the built files (`@license React`, `tailwindcss … MIT License`). The versions are the ones the
lockfile resolves; when they change, this table changes with them. Tools that only build the page (Vite, TypeScript, the Tailwind
plugin) are not in it.
