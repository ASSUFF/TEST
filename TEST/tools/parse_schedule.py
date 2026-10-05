"""总课程表解析器

输入: tools/raw/source.xlsx （腾讯文档导出的原始表格）
输出: js/data.js  (window.SCHEDULE_DATA = ...)，供本地网页直接 <script> 引入

解析要点：
- 表头列（1-based）：1=月份 2=周次 3=时间段 4~10=周一~周日 11=备注
- 每个"周块"的行高不固定，因此节次不能靠行号推断，一律从课程文本中的"(1-2节)"解析
- 区块划分：按 col3 的 上午/下午/晚上 标签；上午=1-4节 下午=5-8节 晚上=9-12节
"""
import json
import re
import sys
from collections import OrderedDict

sys.path.insert(0, "tools")
from xlsx_read import read_sheet  # noqa: E402

WEEK_RE = re.compile(r"^第(\d+)周$")
PERIOD_RE = re.compile(r"[（(]?\s*(\d+)\s*[-—~～]\s*(\d+)\s*节\s*[)）]?")
LOC_HINT = re.compile(r"(教学楼|楼|厅|室|馆|线上|线下|教室)")
MODE_WORDS = {"线上", "线上课", "线下", "线下课", "线上授课"}
CLASS_RE = re.compile(r"^\d+班$")
SECTION_PERIODS = {"上午": (1, 4), "下午": (5, 8), "晚上": (9, 12)}
HOLIDAY_RE = re.compile(r"^(.*?)不排课$")


def clean(s: str) -> str:
    return re.sub(r"[\s\u3000]+", " ", (s or "").replace("\n", " ")).strip()


def tidy_loc(s: str) -> str:
    """仅当整串被圆括号包裹时去掉括号，保留 '1楼报告厅（待定）' 这类内容"""
    s = re.sub(r"\s+", " ", s.strip())
    m = re.fullmatch(r"[（(]\s*(.*?)\s*[)）]", s)
    return m.group(1) if m else s


def parse_cell(raw: str):
    """把单元格文本解析成结构化条目列表（通常只有 1 条）"""
    text = (raw or "").strip()
    if not text:
        return []
    # 一个单元格可能出现多门课，按"节)"后紧跟换行的位置切开
    chunks = [c for c in re.split(r"\n(?=[^\n]*[（(]?\d+\s*[-—~～]\s*\d+\s*节)", text) if c.strip()]
    out = []
    for ch in chunks:
        lines = [ln.strip() for ln in ch.split("\n") if ln.strip()]
        if not lines:
            continue
        head = lines[0]
        pm = PERIOD_RE.search(head)
        if pm:
            p1, p2 = int(pm.group(1)), int(pm.group(2))
            name = clean(head[: pm.start()] + " " + head[pm.end():])
        else:
            p1 = p2 = None
            name = clean(head)
        locs, modes, cls, teachers = [], [], "", []
        for ln in lines[1:]:
            l = ln.strip()
            if not l:
                continue
            if l in MODE_WORDS:
                modes.append(l)
            elif CLASS_RE.match(l):
                cls = l
            elif LOC_HINT.search(l):
                locs.append(tidy_loc(l))
            else:
                teachers.append(clean(l))
        out.append({
            "name": name,
            "p1": p1,
            "p2": p2,
            "loc": " ".join(dict.fromkeys(locs)),
            "mode": "线上" if any("线上" in m for m in modes) else ("线下" if modes else ""),
            "teacher": "、".join(dict.fromkeys(t.strip() for t in teachers)),
            "cls": cls,
            "raw": text,
        })
    return out


def kind_of(e):
    if "不排课" in e["name"]:
        return "holiday"
    if e["p1"] is None:
        return "event"
    return "course"


def main():
    rows, merges, sheet_name = read_sheet("tools/raw/source.xlsx")
    weeks, cur = [], None
    orphan_notes, warnings = [], []

    for r in rows:
        c = [(r[i] if i < len(r) else "") for i in range(11)]
        col2, col3 = c[1].strip(), c[2].strip()

        wk = WEEK_RE.match(col2)
        if wk:
            cur = {"w": int(wk.group(1)), "month": clean(c[0]), "dates": None,
                   "isVacation": False, "entries": []}
            weeks.append(cur)
        elif col2 == "寒假":
            cur = {"w": None, "month": clean(c[0]), "dates": None,
                   "isVacation": True, "entries": []}
            weeks.append(cur)

        # 第 1 周的"日期"行与"周次"表头行是同一行，因此这里不能提前 continue
        if cur is None or col3 == "时间段":       # 其余周的表头行
            continue
        if col3 == "日期":
            cur["dates"] = [clean(c[i]) for i in range(3, 10)]
            continue

        section = col3 if col3 in SECTION_PERIODS else None
        for day in range(7):
            raw = c[3 + day]
            if not raw.strip() or raw.strip() in SECTION_PERIODS:
                continue
            for e in parse_cell(raw):
                e["day"] = day + 1
                e["section"] = section
                e["kind"] = kind_of(e)
                if e["kind"] == "course" and e["p1"] is None:
                    warnings.append(f"w{cur['w']} d{e['day']} 无节次: {e['name']}")
                if e["p1"] is None and section:
                    e["p1"], e["p2"] = SECTION_PERIODS[section]
                weeks_ok = e["kind"] != "course" or (1 <= e["p1"] <= e["p2"] <= 12)
                if not weeks_ok:
                    warnings.append(f"w{cur['w']} d{e['day']} 节次异常: {e['name']} {e['p1']}-{e['p2']}")
                cur["entries"].append(e)

    # ---- 建立课程目录（按 课程名+教师+班级 归并全部上课时段）----
    catalog = OrderedDict()
    for wk in weeks:
        for e in wk["entries"]:
            if e["kind"] != "course":
                continue
            key = f"{e['name']}|{e['teacher']}|{e['cls']}"
            item = catalog.setdefault(key, {
                "key": key, "name": e["name"], "teacher": e["teacher"], "cls": e["cls"],
                "sessions": [],
            })
            item["sessions"].append({
                "w": wk["w"], "day": e["day"], "p1": e["p1"], "p2": e["p2"],
                "loc": e["loc"], "mode": e["mode"],
            })

    for item in catalog.values():
        item["sessions"].sort(key=lambda s: (s["w"], s["day"], s["p1"]))
        locs = [s["loc"] for s in item["sessions"] if s["loc"]]
        item["locSummary"] = max(set(locs), key=locs.count) if locs else ""
        item["weeks"] = sorted({s["w"] for s in item["sessions"]})
        # 归一化节次：同一门课在不同周可能排在不同节次
        item["slots"] = sorted({(s["day"], s["p1"], s["p2"]) for s in item["sessions"]})
        item["days"] = sorted({s["day"] for s in item["sessions"]})

    data = {
        "sheetName": sheet_name,
        "source": "https://docs.qq.com/sheet/DRHB4Y3VJVktWak5S",
        "catalog": list(catalog.values()),
        "weeks": [
            {
                "w": wk["w"], "month": wk["month"], "dates": wk["dates"],
                "isVacation": wk["isVacation"],
                "entries": [
                    {k: v for k, v in e.items() if k != "raw"} for e in wk["entries"]
                ],
            }
            for wk in weeks
        ],
    }

    with open("js/data.js", "w", encoding="utf-8") as f:
        f.write("/* 由 tools/parse_schedule.py 自动生成，请勿手工修改 */\n")
        f.write("window.SCHEDULE_DATA = ")
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write(";\n")

    # ---- 自检输出 ----
    courses = sum(1 for w in weeks for e in w["entries"] if e["kind"] == "course")
    print(f"周块 {len(weeks)} 个（含寒假 {sum(1 for w in weeks if w['isVacation'])}）")
    print(f"课程条目 {courses} 条，节假日/事件 "
          f"{sum(1 for w in weeks for e in w['entries'] if e['kind'] != 'course')} 条")
    print(f"课程目录 {len(catalog)} 门")
    print(f"警告 {len(warnings)} 条")
    for w in warnings[:20]:
        print("  !", w)
    print("\n主要课程：")
    for it in list(catalog.values())[:12]:
        print(f"  {it['name']} | {it['teacher']} | {it['cls']} | "
              f"周{it['weeks'][0]}-{it['weeks'][-1]} | 槽位{it['slots'][:3]} | {it['locSummary']}")


if __name__ == "__main__":
    main()
