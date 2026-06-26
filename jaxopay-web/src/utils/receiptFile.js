import { toPng, toJpeg, toBlob } from 'html-to-image';
import { jsPDF } from 'jspdf';

// Render a DOM node into a downloadable/shareable File (PNG, JPEG, or PDF).
export async function buildReceiptFile(node, format, baseName) {
    const opts = { cacheBust: true, quality: 1, pixelRatio: 2, backgroundColor: '#ffffff' };

    if (format === 'jpeg') {
        const dataUrl = await toJpeg(node, opts);
        const blob = await (await fetch(dataUrl)).blob();
        return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
    }

    if (format === 'pdf') {
        const dataUrl = await toPng(node, opts);
        const img = new window.Image();
        img.src = dataUrl;
        await img.decode();
        const pdf = new jsPDF({
            orientation: img.width >= img.height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [img.width, img.height],
        });
        pdf.addImage(dataUrl, 'PNG', 0, 0, img.width, img.height);
        return new File([pdf.output('blob')], `${baseName}.pdf`, { type: 'application/pdf' });
    }

    // default: png
    const blob = await toBlob(node, opts);
    return new File([blob], `${baseName}.png`, { type: 'image/png' });
}

// Share a node as a real file via the native share sheet (mobile), or download it
// (desktop / unsupported) — never plain text.
export async function shareReceiptFile(node, format, baseName, shareText) {
    const file = await buildReceiptFile(node, format, baseName);
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'JAXOPAY Receipt', text: shareText });
    } else {
        const url = URL.createObjectURL(file);
        const a = Object.assign(document.createElement('a'), { href: url, download: file.name });
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }
}
