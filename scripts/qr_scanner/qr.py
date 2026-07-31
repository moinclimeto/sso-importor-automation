"""
Local QR scanner for PDF invoices.
Reference: climeto-backend/Qr-scanner-main/qr.py

Decoders (all local, no cloud):
  1) pyzbar (ZBar)
  2) zxing-cpp (better on damaged/scanned QR)
  3) OpenCV QRCodeDetector
"""
import cv2
from pyzbar.pyzbar import decode, ZBarSymbol
from pdf2image import convert_from_path
import numpy as np
import json
import base64
import sys
import os

try:
    import zxingcpp
except Exception:
    zxingcpp = None


_default_poppler = "/usr/bin" if os.name != "nt" else r"C:\poppler\Library\bin"
poppler_path = os.environ.get("POPPLER_PATH", _default_poppler)
if not os.path.isdir(poppler_path) and os.path.isdir("/usr/bin"):
    poppler_path = "/usr/bin"


def _try_parse_nested_json(value):
    if not isinstance(value, str):
        return value
    s = value.strip()
    if not s:
        return value
    if not (
        (s.startswith("{") and s.endswith("}"))
        or (s.startswith("[") and s.endswith("]"))
    ):
        return value
    try:
        return json.loads(s)
    except Exception:
        return value


def _normalize_parsed_payload(parsed):
    if isinstance(parsed, dict) and "data" in parsed:
        parsed["data"] = _try_parse_nested_json(parsed["data"])
    return parsed


def _parse_qr_payload(data):
    qr_result = {
        "raw_data": data,
        "parsed_data": None,
        "is_url": False,
        "is_json": False,
        "qr_type": "unknown",
    }

    if data.startswith("http://") or data.startswith("https://"):
        qr_result["is_url"] = True

    parsed = None
    try:
        parsed = json.loads(data)
        parsed = _normalize_parsed_payload(parsed)
        qr_result["parsed_data"] = parsed
        qr_result["is_json"] = True
    except Exception:
        if data.count(".") >= 2:
            try:
                _, payload, _ = data.split(".", 2)
                padding = "=" * (-len(payload) % 4)
                payload_bytes = base64.urlsafe_b64decode(payload + padding)
                parsed = json.loads(payload_bytes.decode("utf-8"))
                parsed = _normalize_parsed_payload(parsed)
                qr_result["parsed_data"] = parsed
                qr_result["is_json"] = True
            except Exception:
                parsed = None
        else:
            try:
                padding = "=" * (-len(data) % 4)
                decoded = base64.urlsafe_b64decode(data + padding)
                parsed = json.loads(decoded.decode("utf-8"))
                parsed = _normalize_parsed_payload(parsed)
                qr_result["parsed_data"] = parsed
                qr_result["is_json"] = True
            except Exception:
                parsed = None

    try:
        qr_type = "unknown"
        if isinstance(parsed, dict):
            payload_data = parsed.get("data")
            if isinstance(payload_data, dict):
                doc_typ = payload_data.get("DocTyp")
                irn = payload_data.get("Irn")
                if (doc_typ or "").upper() == "INV" and irn:
                    qr_type = "einvoice"
            if qr_type == "unknown" and (
                parsed.get("Irn") or parsed.get("DocNo") or parsed.get("SellerGstin")
            ):
                qr_type = "einvoice"

        data_lower = (data or "").lower()
        if qr_type == "unknown" and (
            "ewb no" in data_lower
            or "e-way bill" in data_lower
            or "eway bill" in data_lower
        ):
            qr_type = "eway_bill"

        qr_result["qr_type"] = qr_type
    except Exception:
        pass

    return qr_result


def _variants(img_bgr):
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    out = [img_bgr, gray, cv2.equalizeHist(gray)]
    blur = cv2.GaussianBlur(gray, (3, 3), 0)
    out.append(blur)
    out.append(
        cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 41, 5
        )
    )
    out.append(
        cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 31, 7
        )
    )
    _, otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    out.append(otsu)
    # Morph close helps fill broken QR modules on scans
    kernel = np.ones((2, 2), np.uint8)
    out.append(cv2.morphologyEx(otsu, cv2.MORPH_CLOSE, kernel))
    return out


def _pyzbar_once(img):
    try:
        codes = decode(img, symbols=[ZBarSymbol.QRCODE])
    except TypeError:
        codes = decode(img)
    out = []
    for code in codes:
        try:
            out.append(code.data.decode("utf-8"))
        except Exception:
            continue
    return out


def _pyzbar_detect(img_bgr, deep=False):
    """Fast path: gray/raw first. deep=True tries all preprocess variants."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    for img in (img_bgr, gray):
        texts = _pyzbar_once(img)
        if texts:
            return texts
    if not deep:
        return []
    texts = []
    for variant in _variants(img_bgr)[2:]:
        texts.extend(_pyzbar_once(variant))
        if texts:
            return texts
    return texts


def _zxing_detect(img_bgr, deep=False):
    if zxingcpp is None:
        return []
    variants = _variants(img_bgr) if deep else [img_bgr, cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)]
    texts = []
    for variant in variants:
        try:
            if len(variant.shape) == 2:
                rgb = cv2.cvtColor(variant, cv2.COLOR_GRAY2RGB)
            else:
                rgb = cv2.cvtColor(variant, cv2.COLOR_BGR2RGB)
            results = zxingcpp.read_barcodes(
                rgb,
                formats=zxingcpp.BarcodeFormat.QRCode,
                try_rotate=True,
                try_downscale=True,
                try_invert=True,
            )
            for item in results:
                if item.text:
                    texts.append(item.text)
            if texts:
                return texts
        except Exception:
            continue
    return texts


def _opencv_detect(img_bgr, deep=False):
    detector = cv2.QRCodeDetector()
    variants = _variants(img_bgr) if deep else [img_bgr, cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)]
    found = []
    for variant in variants:
        try:
            data, _, _ = detector.detectAndDecode(variant)
            if data:
                return [data]
            ok, decoded_info, _, _ = detector.detectAndDecodeMulti(variant)
            if ok and decoded_info:
                for item in decoded_info:
                    if item:
                        found.append(item)
                if found:
                    return found
        except Exception:
            continue
    return found


def _crop_regions(img_bgr):
    h, w = img_bgr.shape[:2]
    regions = [("full", img_bgr)]
    boxes = [
        ("left_mid", 0.04, 0.50, 0.30, 0.32),
        ("left_low", 0.05, 0.62, 0.24, 0.24),
        ("left_wide", 0.00, 0.45, 0.38, 0.42),
        ("top_right", 0.55, 0.00, 0.45, 0.35),
    ]
    for name, x, y, ww, hh in boxes:
        x0 = int(w * x)
        y0 = int(h * y)
        x1 = min(w, int(w * (x + ww)))
        y1 = min(h, int(h * (y + hh)))
        if x1 > x0 + 20 and y1 > y0 + 20:
            regions.append((name, img_bgr[y0:y1, x0:x1]))
    return regions


def _try_decoders(scaled, deep=False):
    """Prefer pyzbar (fast) → zxing → opencv; stop on first hit."""
    for fn in (_pyzbar_detect, _zxing_detect, _opencv_detect):
        for data in fn(scaled, deep=deep):
            if data:
                return [data]
    return []


def _decode_image(img_bgr):
    # 1) Full page fast path (digital e-invoice PDFs)
    hit = _try_decoders(img_bgr, deep=False)
    if hit:
        return hit

    # 2) Crops + light scales
    for _name, region in _crop_regions(img_bgr):
        rh, rw = region.shape[:2]
        scales = [1.0]
        if max(rh, rw) < 1000:
            scales.extend([1.5, 2.0])
        elif max(rh, rw) > 3000:
            scales.append(0.5)
        else:
            scales.append(0.85)

        for scale in scales:
            if abs(scale - 1.0) < 1e-6:
                scaled = region
            else:
                scaled = cv2.resize(
                    region,
                    None,
                    fx=scale,
                    fy=scale,
                    interpolation=cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA,
                )
            hit = _try_decoders(scaled, deep=False)
            if hit:
                return hit

    # 3) Deep preprocess only if still empty (scanned / damaged QR)
    hit = _try_decoders(img_bgr, deep=True)
    if hit:
        return hit
    for _name, region in _crop_regions(img_bgr)[1:]:
        hit = _try_decoders(region, deep=True)
        if hit:
            return hit
    return []


def _normalize_ocr_hex(s):
    """Map common OCR confusions then keep hex digits only."""
    t = (s or "").translate(str.maketrans("lIoOsSzZB", "110055228"))
    return "".join(c for c in t.lower() if c in "0123456789abcdef")


def _preprocess_ocr_variants(gray):
    """Yield (name, image) preprocessing variants for Tesseract."""
    yield "raw", gray
    otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
    yield "otsu", otsu
    yield (
        "adapt",
        cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10
        ),
    )
    yield "clahe", cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)


def _collect_irn_hex_streams(img_bgr, pytesseract):
    """OCR IRN-adjacent crops; return normalized hex streams near 'IRN'."""
    import re

    h, w = img_bgr.shape[:2]
    irn_crops = [
        img_bgr[int(h * 0.45) : int(h * 0.85), 0 : int(w * 0.55)],
        img_bgr[int(h * 0.35) : int(h * 0.75), 0 : int(w * 0.55)],
        img_bgr[int(h * 0.48) : int(h * 0.68), 0 : int(w * 0.55)],
    ]
    # Header + body for DocNo / date / EWB (not used for IRN hex voting)
    field_crops = [
        img_bgr[0 : int(h * 0.40), :],
        img_bgr[int(h * 0.35) : int(h * 0.92), 0 : int(w * 0.75)],
    ]
    streams = []
    texts = []
    label_re = re.compile(
        r"IRN\s*(?:No\.?|Number|#)?\s*:?\s*",
        flags=re.IGNORECASE,
    )
    for crop in irn_crops:
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        for name, proc in _preprocess_ocr_variants(gray):
            scales = (2,) if name in ("clahe", "adapt") else (1, 2)
            for scale in scales:
                g = (
                    cv2.resize(
                        proc, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC
                    )
                    if scale > 1
                    else proc
                )
                try:
                    t = pytesseract.image_to_string(g, config="--oem 3 --psm 6")
                except Exception:
                    continue
                if not t or not t.strip():
                    continue
                texts.append(t)
                for m in label_re.finditer(t):
                    chunk = _normalize_ocr_hex(t[m.end() : m.end() + 220])
                    if len(chunk) >= 40:
                        streams.append(chunk)

    for crop in field_crops:
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        gray = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1]
        try:
            t = pytesseract.image_to_string(gray, config="--oem 3 --psm 6")
        except Exception:
            continue
        if t and t.strip():
            texts.append(t)

    return streams, "\n".join(texts)


def _consensus_irn(hex_streams, min_len=48):
    """
    Scanned IRN text is noisy: short junk hex before the real value, then garbage after.
    Vote on a solid early prefix (40 hex), then extend via medoid + confidence trim.
    """
    from collections import Counter

    if not hex_streams:
        return None, 0

    prefix_len = 40
    counts = Counter()
    start_penalty = {}
    for h in hex_streams:
        if len(h) < prefix_len:
            continue
        max_start = min(12, len(h) - prefix_len)
        for i in range(max_start + 1):
            w = h[i : i + prefix_len]
            counts[w] += 1
            start_penalty[w] = start_penalty.get(w, 0) + i

    if not counts:
        return None, 0

    def rank_key(item):
        w, n = item
        avg_start = start_penalty.get(w, 99) / max(n, 1)
        return (-n, avg_start)

    best_prefix, support = sorted(counts.items(), key=rank_key)[0]
    if support < 1 or len(best_prefix) < min(min_len, prefix_len):
        return None, 0

    followers = []
    for h in hex_streams:
        search_to = min(len(h), 12 + prefix_len)
        idx = h.find(best_prefix, 0, search_to)
        if idx < 0:
            idx = h.find(best_prefix)
        if idx >= 0 and idx <= 12:
            followers.append(h[idx : idx + 64])

    if not followers:
        return best_prefix if len(best_prefix) >= min_len else None, support

    def disagree(a, b, n=48):
        L = min(n, len(a), len(b))
        return sum(x != y for x, y in zip(a[:L], b[:L]))

    medoid = min(
        followers,
        key=lambda a: sum(disagree(a, b) for b in followers),
    )

    irn_chars = []
    for pos in range(min(64, len(medoid))):
        votes = Counter()
        for f in followers:
            if pos < len(f):
                votes[f[pos]] += 1
        if not votes:
            break
        ch, n = votes.most_common(1)[0]
        if medoid[pos] in votes and votes[medoid[pos]] >= n - 1:
            ch = medoid[pos]
            n = votes[ch]
        conf = n / max(len(followers), 1)
        # Stop on collapsing confidence or OCR garbage runs (eee/aaa…)
        if pos >= prefix_len and conf < 0.4:
            break
        if pos >= 48 and conf < 0.5:
            break
        if pos >= 44 and len(irn_chars) >= 3:
            tail = "".join(irn_chars[-2:]) + ch
            if len(set(tail)) == 1:
                break
        irn_chars.append(ch)

    irn = "".join(irn_chars)
    if len(irn) < min_len:
        # Extend prefix with medoid if available
        if len(medoid) >= min_len:
            return medoid[: min(64, max(min_len, len(irn) or min_len))], support
        return None, support
    return irn[:64], support


def _ocr_einvoice_fields(img_bgr):
    """
    Local Tesseract fallback when QR pixels cannot be decoded (scanned invoices).
    Reads printed IRN / invoice fields from the page — no cloud API.
    """
    try:
        import pytesseract
        import re
    except Exception:
        return None

    hex_streams, text = _collect_irn_hex_streams(img_bgr, pytesseract)
    irn, support = _consensus_irn(hex_streams, min_len=48)

    # Exact 64-hex still preferred when OCR is clean
    if not irn or len(irn) < 64:
        exact = re.search(
            r"(?:IRN\s*No\.?\s*:?\s*)([a-fA-F0-9]{64})",
            text,
            flags=re.IGNORECASE,
        )
        if not exact:
            exact = re.search(r"\b([a-fA-F0-9]{64})\b", text)
        if exact:
            irn = exact.group(1).lower()
            support = max(support, 1)

    inv_match = re.search(
        r"(?:Invoice\s*No\.?|Inv\.?\s*No\.?|Doc\.?\s*No\.?)\s*:?\s*([A-Za-z0-9\-\/]+)",
        text,
        flags=re.IGNORECASE,
    )
    if not inv_match:
        inv_match = re.search(r"\b(B[IIl1]\d{3,6})\b", text, flags=re.IGNORECASE)
    date_match = re.search(
        r"(?:Invoice\s*Date|Date)\s*:?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})",
        text,
        flags=re.IGNORECASE,
    )
    gstin_matches = re.findall(
        r"\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9])\b",
        text,
        flags=re.IGNORECASE,
    )
    ewb_match = re.search(
        r"(?:E-?Way\s*Bill\s*No\.?|EWB\s*No\.?|E-?Way\s*Bill)\s*:?\s*([0-9]{10,15})",
        text,
        flags=re.IGNORECASE,
    )
    if not ewb_match:
        ewb_match = re.search(r"\b([0-9]{12})\b", text)
    total_match = re.search(
        r"(?:Grand\s*Total|Total\s*Amount|TotInvVal)\s*:?\s*[₹Rs\.]*\s*([0-9,]+\.?[0-9]*)",
        text,
        flags=re.IGNORECASE,
    )

    if not irn or not re.fullmatch(r"[a-f0-9]{48,64}", irn):
        return None

    tot = 0.0
    if total_match:
        try:
            tot = float(total_match.group(1).replace(",", ""))
        except Exception:
            tot = 0.0

    doc_no = inv_match.group(1).strip() if inv_match else ""
    # OCR often reads BI as Bl
    if re.fullmatch(r"B[Il1]\d+", doc_no, flags=re.IGNORECASE):
        doc_no = "BI" + re.sub(r"^[Bb][Il1]", "", doc_no)

    parsed = {
        "Irn": irn,
        "printedIrn": irn,
        "irnLength": len(irn),
        "irnComplete": len(irn) == 64,
        "irnApproximate": True,  # Tesseract estimate — may differ by 1–3 hex digits
        "irnSupport": support,
        "DocNo": doc_no,
        "DocDt": date_match.group(1).strip() if date_match else "",
        "SellerGstin": (gstin_matches[0].upper() if len(gstin_matches) > 0 else ""),
        "BuyerGstin": (gstin_matches[1].upper() if len(gstin_matches) > 1 else ""),
        "EwbNo": ewb_match.group(1) if ewb_match else "",
        "TotInvVal": tot,
        "source": "tesseract-irn-fallback",
    }

    return {
        "raw_data": json.dumps(parsed),
        "parsed_data": parsed,
        "is_url": False,
        "is_json": True,
        "qr_type": "einvoice",
        "decode_method": "tesseract_printed_irn",
    }


def scan_qr_from_pdf(pdf_path, dpi=200):
    result = {
        "success": False,
        "pages": [],
        "total_qr_codes": 0,
        "error": None,
        "decoders": ["zxing-cpp", "pyzbar", "opencv", "tesseract-irn"],
    }

    try:
        if not os.path.exists(pdf_path):
            result["error"] = f"PDF file not found: {pdf_path}"
            return result

        # First page only — e-invoice QR is on page 1; big speed win
        max_pages = int(os.environ.get("QR_MAX_PAGES", "1"))
        used_dpi = dpi
        pages = convert_from_path(
            pdf_path,
            dpi=dpi,
            first_page=1,
            last_page=max_pages,
            poppler_path=poppler_path,
        )
        result["dpi"] = used_dpi

        for i, page in enumerate(pages):
            page_result = {"page_number": i + 1, "qr_codes": []}
            img = cv2.cvtColor(np.array(page), cv2.COLOR_RGB2BGR)
            decoded_texts = _decode_image(img)

            # Escalate DPI only if empty (scanned / small QR)
            if not decoded_texts and i == 0 and dpi < 350:
                try:
                    hi_dpi = 350
                    hi = convert_from_path(
                        pdf_path,
                        dpi=hi_dpi,
                        first_page=1,
                        last_page=1,
                        poppler_path=poppler_path,
                    )
                    if hi:
                        img = cv2.cvtColor(np.array(hi[0]), cv2.COLOR_RGB2BGR)
                        decoded_texts = _decode_image(img)
                        if decoded_texts:
                            result["dpi"] = hi_dpi
                except Exception:
                    pass

            for data in decoded_texts:
                page_result["qr_codes"].append(_parse_qr_payload(data))
                result["total_qr_codes"] += 1

            # Scanned invoices: QR may be unreadable; read printed IRN locally
            if not page_result["qr_codes"]:
                ocr_hit = _ocr_einvoice_fields(img)
                if ocr_hit:
                    page_result["qr_codes"].append(ocr_hit)
                    result["total_qr_codes"] += 1
                    result["fallback"] = "tesseract_printed_irn"

            result["pages"].append(page_result)

        result["success"] = True
    except Exception as e:
        result["error"] = str(e)
        result["success"] = False

    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(
            json.dumps(
                {"success": False, "error": "Please provide PDF path as argument"},
                indent=2,
            )
        )
        sys.exit(1)

    pdf_path = sys.argv[1]
    dpi = int(os.environ.get("QR_SCAN_DPI", "200"))
    result = scan_qr_from_pdf(pdf_path, dpi=dpi)
    print(json.dumps(result, indent=2, ensure_ascii=False))
