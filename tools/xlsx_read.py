"""极简 xlsx 读取器（仅依赖标准库），用于规避 openpyxl 对导出文件样式表的兼容问题。

用途：读取总课程表 xlsx，返回 (rows, merges)。
rows: list[list[str]]，按 max_row/max_col 补齐的空字符串矩阵（0-based）。
merges: list[(min_row, min_col, max_row, max_col)]，元素均为 1-based。
"""
import re
import zipfile
import xml.etree.ElementTree as ET

NS_MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
CELL_RE = re.compile(r"([A-Z]+)(\d+)")


def col_to_index(col_letters: str) -> int:
    """A -> 1, Z -> 26, AA -> 27"""
    n = 0
    for ch in col_letters:
        n = n * 26 + (ord(ch) - ord("A") + 1)
    return n


def index_to_col(n: int) -> str:
    s = ""
    while n > 0:
        n, r = divmod(n - 1, 26)
        s = chr(ord("A") + r) + s
    return s


def _read_shared_strings(zf: zipfile.ZipFile) -> list:
    try:
        raw = zf.read("xl/sharedStrings.xml")
    except KeyError:
        return []
    root = ET.fromstring(raw)
    out = []
    for si in root.findall(NS_MAIN + "si"):
        # 合并富文本的所有 <t> 片段
        out.append("".join(t.text or "" for t in si.iter(NS_MAIN + "t")))
    return out


def _cell_value(node, shared):
    t = node.get("t")
    if t == "inlineStr":
        return "".join(x.text or "" for x in node.iter(NS_MAIN + "t"))
    v = node.find(NS_MAIN + "v")
    if v is None or v.text is None:
        return ""
    if t == "s":
        idx = int(v.text)
        return shared[idx] if 0 <= idx < len(shared) else ""
    return v.text


def read_sheet(path: str, sheet_index: int = 1):
    """返回 (rows, merges, sheet_name)。sheet_index 从 1 开始。"""
    with zipfile.ZipFile(path) as zf:
        shared = _read_shared_strings(zf)
        names = sorted(
            n for n in zf.namelist()
            if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n)
        )
        if not names:
            raise RuntimeError("xlsx 中未找到工作表")
        target = names[min(sheet_index, len(names)) - 1]
        root = ET.fromstring(zf.read(target))

        sheet_name = ""
        try:
            wb = ET.fromstring(zf.read("xl/workbook.xml"))
            sheets = wb.find(NS_MAIN + "sheets").findall(NS_MAIN + "sheet")
            if sheets:
                sheet_name = sheets[min(sheet_index, len(sheets)) - 1].get("name", "")
        except Exception:
            pass

        grid = {}
        max_r = max_c = 0
        for row in root.iter(NS_MAIN + "row"):
            for c in row.findall(NS_MAIN + "c"):
                ref = c.get("r") or ""
                m = CELL_RE.fullmatch(ref)
                if not m:
                    continue
                ci, ri = col_to_index(m.group(1)), int(m.group(2))
                val = _cell_value(c, shared)
                if val == "":
                    continue
                grid[(ri, ci)] = val
                max_r = max(max_r, ri)
                max_c = max(max_c, ci)

        merges = []
        mc = root.find(NS_MAIN + "mergeCells")
        if mc is not None:
            for m in mc.findall(NS_MAIN + "mergeCell"):
                rng = m.get("ref", "")
                if ":" not in rng:
                    continue
                a, b = rng.split(":")
                ma, mb = CELL_RE.fullmatch(a), CELL_RE.fullmatch(b)
                if not (ma and mb):
                    continue
                merges.append((
                    int(ma.group(2)), col_to_index(ma.group(1)),
                    int(mb.group(2)), col_to_index(mb.group(1)),
                ))

    rows = [["" for _ in range(max_c)] for _ in range(max_r)]
    for (ri, ci), val in grid.items():
        rows[ri - 1][ci - 1] = val
    return rows, merges, sheet_name


if __name__ == "__main__":
    rows, merges, name = read_sheet("tools/raw/source.xlsx")
    print("sheet:", name, "rows:", len(rows), "cols:", len(rows[0]) if rows else 0,
          "merges:", len(merges))
    for r in merges[:15]:
        print("  merge", r)
    for i, r in enumerate(rows[:16], start=1):
        print(i, [x.replace("\n", "/") for x in r])
