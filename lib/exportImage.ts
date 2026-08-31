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

    const blob = await new Promise<Blob | null>(
      (resolve) => {
        canvas.toBlob(
          (result) => resolve(result),
          "image/png"
        );
      }
    );

    if (!blob) {
      alert(errorMessage);
      return;
    }

    const file = new File(
      [blob],
      fileName,
      {
        type: "image/png",
      }
    );

    if (
      navigator.share &&
      navigator.canShare?.({
        files: [file],
      })
    ) {
      await navigator.share({
        files: [file],
        title: "月レポート",
      });

      return;
    }

    const link =
      document.createElement("a");

    link.download = fileName;
    link.href =
      URL.createObjectURL(blob);

    link.click();

    URL.revokeObjectURL(
      link.href
    );
  } catch (e) {
    console.error(e);
    alert(errorMessage);
  }
}