import html2canvas from "html2canvas";

export async function exportElementImage(
  elementId: string,
  fileName: string,
  notFoundMessage: string,
  errorMessage: string
) {
  try {
    const el = document.getElementById(elementId);

    if (!el) {
      alert(notFoundMessage);
      return;
    }

    const canvas = await html2canvas(el, {
      backgroundColor: "#ffffff",
      scale: 2,
    });

    const link = document.createElement("a");
    link.download = fileName;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (e) {
    console.error(e);
    alert(errorMessage);
  }
}