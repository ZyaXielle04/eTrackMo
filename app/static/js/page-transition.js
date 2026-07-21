document.addEventListener("DOMContentLoaded", function () {
  document.body.classList.add("page-loaded");

  const links = document.querySelectorAll("a[href]");

  links.forEach(function (link) {
    const href = link.getAttribute("href");

    if (
      !href ||
      href.startsWith("#") ||
      href.startsWith("http") ||
      href.startsWith("mailto:") ||
      href.startsWith("tel:") ||
      link.target === "_blank"
    ) {
      return;
    }

    link.addEventListener("click", function (event) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
        return;
      }

      event.preventDefault();

      document.body.classList.remove("page-loaded");

      document.body.classList.add("page-exit");

      setTimeout(function () {
        window.location.href = href;
      }, 300);
    });
  });
});

window.addEventListener("pageshow", function () {
  document.body.classList.remove("page-exit");

  document.body.classList.add("page-loaded");
});
