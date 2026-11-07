import { formatNumber, MAX_CHARS } from "./data";

export async function extractDocument(file: File): Promise<string> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["txt", "md", "pdf", "docx"].includes(extension))
    throw new Error("Hỗ trợ tệp PDF, DOCX, TXT và Markdown.");
  if (file.size > 10 * 1024 * 1024) throw new Error("Tệp tối đa 10 MB. Hãy chia nhỏ tài liệu.");
  let text = "";
  if (extension === "pdf") {
    const [pdfjs, worker] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    let pdf;
    try {
      pdf = await pdfjs.getDocument({
        data: new Uint8Array(await file.arrayBuffer()),
        isEvalSupported: false,
        useSystemFonts: true,
      }).promise;
      if (pdf.numPages > 200) throw new Error("Tài liệu tối đa 200 trang. Hãy chia nhỏ tệp.");
      for (let page = 1; page <= pdf.numPages; page++) {
        const content = await (await pdf.getPage(page)).getTextContent();
        text +=
          content.items.map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")).join("") +
          "\n\n";
        if (text.trim().length > MAX_CHARS) throw new Error(`Nội dung tệp vượt giới hạn ${formatNumber(MAX_CHARS)} ký tự.`);
      }
    } catch (error) {
      if ((error as Error).name === "PasswordException")
        throw new Error("Vui lòng mở khóa PDF trước khi nhập.");
      throw error;
    } finally {
      await pdf?.destroy();
    }
  } else if (extension === "docx") {
    const mammoth = await import("mammoth");
    text = (await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })).value;
  } else text = await file.text();
  text = text.replace(/^\uFEFF/, "").trim();
  if (!text)
    throw new Error(
      extension === "pdf"
        ? "PDF chưa có văn bản đọc được. Với bản scan, cần nhận dạng chữ trước."
        : "Tệp chưa có nội dung.",
    );
  if (text.includes("\u0000")) throw new Error("Tệp không phải văn bản hợp lệ.");
  if (text.length > MAX_CHARS) throw new Error(`Nội dung tệp vượt giới hạn ${formatNumber(MAX_CHARS)} ký tự.`);
  return text;
}
