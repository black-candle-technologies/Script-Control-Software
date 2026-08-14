use quick_xml::{events::Event, Reader};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::Path};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

pub type Metadata = BTreeMap<String, String>;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockType {
    SceneHeading,
    Action,
    Character,
    Dialogue,
    Parenthetical,
    Transition,
    Shot,
    General,
    Lyrics,
    CastList,
    NewAct,
    EndOfAct,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextRun {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub strikeout: bool,
    pub revision_id: Option<String>,
    pub metadata: Metadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenplayBlock {
    pub id: String,
    #[serde(rename = "type")]
    pub block_type: BlockType,
    pub text: String,
    pub text_runs: Vec<TextRun>,
    pub scene_id: Option<String>,
    pub original_type: String,
    pub metadata: Metadata,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitlePage {
    pub title: String,
    pub author: String,
    pub blocks: Vec<TitlePageBlock>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitlePageBlock {
    #[serde(rename = "type")]
    pub block_type: String,
    pub text: String,
    pub metadata: Metadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scene {
    pub id: String,
    pub scene_number: Option<String>,
    pub heading: String,
    pub interior_exterior: Option<String>,
    pub location: Option<String>,
    pub time_of_day: Option<String>,
    pub block_start: usize,
    pub block_end: usize,
    pub character_ids: Vec<String>,
    pub metadata: Metadata,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Character {
    pub id: String,
    pub canonical_name: String,
    pub display_name: String,
    pub aliases: Vec<String>,
    pub first_appearance_block_id: String,
    pub scene_ids: Vec<String>,
    pub dialogue_block_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    pub id: String,
    pub canonical_name: String,
    pub display_name: String,
    pub interior_exterior_usages: Vec<String>,
    pub scene_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScriptSource {
    #[serde(rename = "type")]
    pub source_type: String,
    pub path: String,
    pub file_name: String,
    pub fdx_version: Option<String>,
    pub last_imported_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportWarning {
    pub code: String,
    pub message: String,
    pub block_index: Option<usize>,
    pub severity: String,
    pub data_preserved: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryBoardRect {
    pub left: f64,
    pub top: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryBoardCanvas {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub width: f64,
    pub height: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zoom_level: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scroll_origin: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryBeat {
    pub id: String,
    pub title: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub board: Option<StoryBoardRect>,
    pub status: String,
    pub moments: Vec<StoryMoment>,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryMoment {
    pub id: String,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryConnection {
    pub id: String,
    pub from_id: String,
    pub to_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub front_cap: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end_cap: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub board: Option<StoryBoardRect>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryAct {
    pub id: String,
    pub title: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedStoryStructure {
    pub acts: Vec<StoryAct>,
    pub sequences: Vec<serde_json::Value>,
    pub beats: Vec<StoryBeat>,
    pub scene_order: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub connections: Vec<StoryConnection>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub board: Option<StoryBoardCanvas>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedWorkspace {
    pub story_structure: ImportedStoryStructure,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenplayDocument {
    pub id: String,
    pub title: String,
    pub source: ScriptSource,
    pub metadata: Metadata,
    pub title_page: TitlePage,
    pub blocks: Vec<ScreenplayBlock>,
    pub scenes: Vec<Scene>,
    pub characters: Vec<Character>,
    pub locations: Vec<Location>,
    pub warnings: Vec<ImportWarning>,
    pub scene_notes: Metadata,
    pub read_only: bool,
    pub workspace: ImportedWorkspace,
}

#[derive(Default)]
struct Paragraph {
    original_type: String,
    attrs: Metadata,
    runs: Vec<TextRun>,
    in_title_page: bool,
    target: ParagraphTarget,
}

#[derive(Default, PartialEq, Eq)]
enum ParagraphTarget {
    #[default]
    Ignore,
    Script,
    TitlePage,
    Beat,
    Outline,
}

pub fn parse_file(path: &Path) -> Result<ScreenplayDocument, String> {
    if path
        .extension()
        .and_then(|x| x.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
        != Some("fdx")
    {
        return Err("Choose a Final Draft .fdx file.".into());
    }
    let bytes = std::fs::read(path).map_err(|error| friendly_io_error(path, error))?;
    parse(&bytes, path)
}

pub fn parse(xml: &[u8], path: &Path) -> Result<ScreenplayDocument, String> {
    let mut reader = Reader::from_reader(xml);
    reader.config_mut().trim_text(false);
    let mut buf = Vec::new();
    let mut metadata = Metadata::new();
    let mut version = None;
    let mut title_page = TitlePage::default();
    let mut blocks = Vec::new();
    let mut warnings = Vec::new();
    let mut paragraph: Option<Paragraph> = None;
    let mut run: Option<TextRun> = None;
    let mut title_depth = 0usize;
    let mut element_path = Vec::<String>::new();
    let mut beats = Vec::<StoryBeat>::new();
    let mut active_beat: Option<StoryBeat> = None;
    let mut pending_outline: Option<StoryBeat> = None;
    let mut connections = Vec::<StoryConnection>::new();
    let mut board_rects = BTreeMap::<String, StoryBoardRect>::new();
    let mut board = None::<StoryBoardCanvas>;
    let mut in_beat_display_board = false;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(tag)) => {
                let name = String::from_utf8_lossy(tag.name().as_ref()).to_string();
                let attrs = attributes(&tag, &reader)?;
                match name.as_str() {
                    "FinalDraft" => {
                        metadata = attrs;
                        version = metadata.get("Version").cloned();
                    }
                    "TitlePage" => title_depth += 1,
                    "ListItem" if is_root_container(&element_path, "ListItems") => {
                        match attrs.get("Type").map(String::as_str) {
                            Some(value) if value.eq_ignore_ascii_case("Beat") => {
                                active_beat = Some(beat_from_attributes(&attrs, beats.len()));
                            }
                            Some(value) if value.eq_ignore_ascii_case("PeerLink") => {
                                if let Some(connection) =
                                    connection_from_attributes(&attrs, connections.len())
                                {
                                    connections.push(connection);
                                }
                            }
                            _ => {}
                        }
                    }
                    "DisplayBoard" if is_root_container(&element_path, "DisplayBoards") => {
                        in_beat_display_board = attrs
                            .get("Type")
                            .is_some_and(|value| value.eq_ignore_ascii_case("Beat"));
                        if in_beat_display_board {
                            board = board_from_attributes(&attrs);
                        }
                    }
                    "Item"
                        if in_beat_display_board
                            && is_root_child(&element_path, "DisplayBoards", "DisplayBoard") =>
                    {
                        if let Some((id, rect)) = rect_from_attributes(&attrs) {
                            board_rects.insert(id, rect);
                        }
                    }
                    "Paragraph" => {
                        let original_type = attrs
                            .get("Type")
                            .cloned()
                            .unwrap_or_else(|| "Unknown".into());
                        let target = paragraph_target(
                            &element_path,
                            title_depth > 0,
                            active_beat.is_some(),
                            &original_type,
                        );
                        if target == ParagraphTarget::Script {
                            flush_outline(&mut pending_outline, &mut beats);
                        }
                        paragraph = Some(Paragraph {
                            original_type,
                            attrs,
                            runs: Vec::new(),
                            in_title_page: title_depth > 0,
                            target,
                        });
                    }
                    "Text" if paragraph.is_some() => run = Some(text_run(attrs)),
                    _ => {}
                }
                element_path.push(name);
            }
            Ok(Event::Empty(tag)) => {
                let name = String::from_utf8_lossy(tag.name().as_ref()).to_string();
                let attrs = attributes(&tag, &reader)?;
                match name.as_str() {
                    "Text" => {
                        if let Some(current) = paragraph.as_mut() {
                            current.runs.push(text_run(attrs));
                        }
                    }
                    "Paragraph" => {
                        let original_type = attrs
                            .get("Type")
                            .cloned()
                            .unwrap_or_else(|| "Unknown".into());
                        let target = paragraph_target(
                            &element_path,
                            title_depth > 0,
                            active_beat.is_some(),
                            &original_type,
                        );
                        if target == ParagraphTarget::Script {
                            flush_outline(&mut pending_outline, &mut beats);
                        }
                        finish_paragraph(
                            Paragraph {
                                original_type,
                                attrs,
                                runs: Vec::new(),
                                in_title_page: title_depth > 0,
                                target,
                            },
                            &mut title_page,
                            &mut blocks,
                            &mut warnings,
                            &mut active_beat,
                            &mut pending_outline,
                            &mut beats,
                        );
                    }
                    "ListItem" if is_root_container(&element_path, "ListItems") => {
                        match attrs.get("Type").map(String::as_str) {
                            Some(value) if value.eq_ignore_ascii_case("Beat") => {
                                let beat_index = beats.len();
                                push_beat(&mut beats, beat_from_attributes(&attrs, beat_index));
                            }
                            Some(value) if value.eq_ignore_ascii_case("PeerLink") => {
                                if let Some(connection) =
                                    connection_from_attributes(&attrs, connections.len())
                                {
                                    connections.push(connection);
                                }
                            }
                            _ => {}
                        }
                    }
                    "DisplayBoard"
                        if is_root_container(&element_path, "DisplayBoards")
                            && attrs
                                .get("Type")
                                .is_some_and(|value| value.eq_ignore_ascii_case("Beat")) =>
                    {
                        board = board_from_attributes(&attrs);
                    }
                    "Item"
                        if in_beat_display_board
                            && is_root_child(&element_path, "DisplayBoards", "DisplayBoard") =>
                    {
                        if let Some((id, rect)) = rect_from_attributes(&attrs) {
                            board_rects.insert(id, rect);
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(text)) => {
                if let Some(current) = run.as_mut() {
                    current.text.push_str(
                        &text
                            .decode()
                            .map_err(|e| format!("FDX text could not be decoded: {e}"))?,
                    );
                }
            }
            Ok(Event::CData(text)) => {
                if let Some(current) = run.as_mut() {
                    current.text.push_str(
                        &text
                            .decode()
                            .map_err(|e| format!("FDX text could not be decoded: {e}"))?,
                    );
                }
            }
            Ok(Event::End(tag)) => {
                match tag.name().as_ref() {
                    b"Text" => {
                        if let (Some(current), Some(finished)) = (paragraph.as_mut(), run.take()) {
                            current.runs.push(finished);
                        }
                    }
                    b"Paragraph" => {
                        if let Some(finished) = paragraph.take() {
                            finish_paragraph(
                                finished,
                                &mut title_page,
                                &mut blocks,
                                &mut warnings,
                                &mut active_beat,
                                &mut pending_outline,
                                &mut beats,
                            );
                        }
                    }
                    b"ListItem" if is_root_child(&element_path, "ListItems", "ListItem") => {
                        if let Some(beat) = active_beat.take() {
                            push_beat(&mut beats, beat);
                        }
                    }
                    b"Content" if is_screenplay_content(&element_path) => {
                        flush_outline(&mut pending_outline, &mut beats);
                    }
                    b"DisplayBoard"
                        if is_root_child(&element_path, "DisplayBoards", "DisplayBoard") =>
                    {
                        in_beat_display_board = false;
                    }
                    b"TitlePage" => title_depth = title_depth.saturating_sub(1),
                    _ => {}
                }
                element_path.pop();
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(format!("This file is not valid FDX XML: {error}")),
            _ => {}
        }
        buf.clear();
    }

    if blocks.is_empty() {
        return Err("The FDX file contains no screenplay paragraphs.".into());
    }

    let source_path = path.to_string_lossy().to_string();
    let file_name = path
        .file_name()
        .and_then(|x| x.to_str())
        .unwrap_or("screenplay.fdx")
        .to_string();
    let id = stable_id("document", &source_path);
    let title = if title_page.title.trim().is_empty() {
        path.file_stem()
            .and_then(|x| x.to_str())
            .unwrap_or("Untitled Screenplay")
            .to_string()
    } else {
        title_page.title.clone()
    };
    title_page.title = title.clone();
    let (scenes, characters, locations) = derive_structure(&mut blocks, &mut warnings);
    for beat in &mut beats {
        beat.board = board_rects.remove(&beat.id);
    }
    for connection in &mut connections {
        connection.board = board_rects.remove(&connection.id);
    }
    let beat_ids = beats
        .iter()
        .map(|beat| beat.id.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    connections.retain(|connection| {
        beat_ids.contains(connection.from_id.as_str())
            && beat_ids.contains(connection.to_id.as_str())
    });
    let scene_order = scenes
        .iter()
        .filter_map(|scene| blocks.get(scene.block_start).map(|block| block.id.clone()))
        .collect();

    Ok(ScreenplayDocument {
        id,
        title,
        source: ScriptSource {
            source_type: "fdx".into(),
            path: source_path,
            file_name,
            fdx_version: version,
            last_imported_at: now(),
        },
        metadata,
        title_page,
        blocks,
        scenes,
        characters,
        locations,
        warnings,
        scene_notes: Metadata::new(),
        read_only: true,
        workspace: ImportedWorkspace {
            story_structure: ImportedStoryStructure {
                acts: vec![StoryAct {
                    id: "act-1".into(),
                    title: "Act I".into(),
                }],
                sequences: Vec::new(),
                beats,
                scene_order,
                connections,
                board,
            },
        },
    })
}

fn finish_paragraph(
    paragraph: Paragraph,
    title_page: &mut TitlePage,
    blocks: &mut Vec<ScreenplayBlock>,
    warnings: &mut Vec<ImportWarning>,
    active_beat: &mut Option<StoryBeat>,
    pending_outline: &mut Option<StoryBeat>,
    beats: &mut Vec<StoryBeat>,
) {
    let text = paragraph
        .runs
        .iter()
        .map(|run| run.text.as_str())
        .collect::<String>();
    if paragraph.target == ParagraphTarget::TitlePage || paragraph.in_title_page {
        if paragraph.original_type.eq_ignore_ascii_case("Title") && title_page.title.is_empty() {
            title_page.title = text.trim().to_string();
        } else if matches!(
            paragraph.original_type.to_ascii_lowercase().as_str(),
            "author" | "written by"
        ) && title_page.author.is_empty()
        {
            title_page.author = text.trim().to_string();
        }
        title_page.blocks.push(TitlePageBlock {
            block_type: paragraph.original_type,
            text,
            metadata: paragraph.attrs,
        });
        return;
    }

    if paragraph.target == ParagraphTarget::Beat {
        if let Some(beat) = active_beat.as_mut() {
            append_paragraph(&mut beat.text, &text);
        }
        return;
    }

    if paragraph.target == ParagraphTarget::Outline {
        if is_outline_heading(&paragraph.original_type) {
            flush_outline(pending_outline, beats);
            let id = paragraph
                .attrs
                .get("Id")
                .or_else(|| paragraph.attrs.get("id"))
                .cloned()
                .unwrap_or_else(|| stable_id("outline-beat", &format!("{}:{}", beats.len(), text)));
            *pending_outline = Some(StoryBeat {
                id,
                title: text.trim().to_string(),
                text: String::new(),
                color: paragraph.attrs.get("Color").cloned(),
                board: None,
                status: "drafted".into(),
                moments: Vec::new(),
                source: "fdx".into(),
            });
        } else {
            let beat = pending_outline.get_or_insert_with(|| StoryBeat {
                id: paragraph
                    .attrs
                    .get("Id")
                    .or_else(|| paragraph.attrs.get("id"))
                    .cloned()
                    .unwrap_or_else(|| {
                        stable_id("outline-beat", &format!("{}:{}", beats.len(), text))
                    }),
                title: String::new(),
                text: String::new(),
                color: paragraph.attrs.get("Color").cloned(),
                board: None,
                status: "drafted".into(),
                moments: Vec::new(),
                source: "fdx".into(),
            });
            append_paragraph(&mut beat.text, &text);
        }
        return;
    }

    if paragraph.target != ParagraphTarget::Script {
        return;
    }

    let block_type = map_type(&paragraph.original_type);
    let index = blocks.len();
    if block_type == BlockType::Unknown {
        warnings.push(warning(
            "UnknownParagraphType",
            format!(
                "Paragraph type '{}' is displayed as an unsupported block.",
                paragraph.original_type
            ),
            Some(index),
            true,
        ));
    }
    if text.trim().is_empty() {
        warnings.push(warning(
            "EmptyParagraph",
            "An empty paragraph was preserved.",
            Some(index),
            true,
        ));
    }
    let paragraph_id = paragraph
        .attrs
        .get("Id")
        .or_else(|| paragraph.attrs.get("id"));
    blocks.push(ScreenplayBlock {
        id: paragraph_id
            .cloned()
            .unwrap_or_else(|| format!("block-{:04}", index + 1)),
        block_type,
        text,
        text_runs: paragraph.runs,
        scene_id: None,
        original_type: paragraph.original_type,
        metadata: paragraph.attrs,
    });
}

fn paragraph_target(
    path: &[String],
    in_title_page: bool,
    in_beat: bool,
    original_type: &str,
) -> ParagraphTarget {
    if in_title_page {
        ParagraphTarget::TitlePage
    } else if in_beat && is_root_beat_content(path) {
        ParagraphTarget::Beat
    } else if is_screenplay_content(path) && is_outline_type(original_type) {
        ParagraphTarget::Outline
    } else if is_screenplay_content(path) {
        ParagraphTarget::Script
    } else {
        ParagraphTarget::Ignore
    }
}

fn is_screenplay_content(path: &[String]) -> bool {
    matches!(path, [root, content] if root == "FinalDraft" && content == "Content")
}

fn is_root_container(path: &[String], container: &str) -> bool {
    matches!(path, [root, section] if root == "FinalDraft" && section == container)
}

fn is_root_child(path: &[String], container: &str, child: &str) -> bool {
    matches!(path, [root, section, item]
        if root == "FinalDraft" && section == container && item == child)
}

fn is_root_beat_content(path: &[String]) -> bool {
    matches!(path, [root, list_items, list_item, content]
        if root == "FinalDraft"
            && list_items == "ListItems"
            && list_item == "ListItem"
            && content == "Content")
}

fn is_outline_type(value: &str) -> bool {
    let value = value.trim().to_ascii_lowercase();
    value == "summary" || value == "outline body" || value.starts_with("outline ")
}

fn is_outline_heading(value: &str) -> bool {
    let value = value.trim().to_ascii_lowercase();
    value.starts_with("outline ") && value != "outline body"
}

fn beat_from_attributes(attrs: &Metadata, index: usize) -> StoryBeat {
    let title = attrs.get("Title").cloned().unwrap_or_default();
    StoryBeat {
        id: attrs
            .get("Id")
            .or_else(|| attrs.get("id"))
            .cloned()
            .unwrap_or_else(|| stable_id("fdx-beat", &format!("{index}:{title}"))),
        title,
        text: String::new(),
        color: attrs.get("Color").cloned(),
        board: None,
        status: "drafted".into(),
        moments: Vec::new(),
        source: "fdx".into(),
    }
}

fn connection_from_attributes(attrs: &Metadata, index: usize) -> Option<StoryConnection> {
    let from_id = attrs.get("StartPoint")?.clone();
    let to_id = attrs.get("EndPoint")?.clone();
    Some(StoryConnection {
        id: attrs
            .get("Id")
            .or_else(|| attrs.get("id"))
            .cloned()
            .unwrap_or_else(|| stable_id("fdx-link", &format!("{index}:{from_id}:{to_id}"))),
        from_id,
        to_id,
        color: attrs.get("Color").cloned(),
        front_cap: attrs.get("FrontCap").cloned(),
        end_cap: attrs.get("EndCap").cloned(),
        board: None,
    })
}

fn rect_from_attributes(attrs: &Metadata) -> Option<(String, StoryBoardRect)> {
    let id = attrs.get("Id").or_else(|| attrs.get("id"))?.clone();
    let rect = StoryBoardRect {
        left: number_attribute(attrs, "Left")?,
        top: number_attribute(attrs, "Top")?,
        width: number_attribute(attrs, "Width")?,
        height: number_attribute(attrs, "Height")?,
    };
    (rect.width > 0.0 && rect.height > 0.0).then_some((id, rect))
}

fn board_from_attributes(attrs: &Metadata) -> Option<StoryBoardCanvas> {
    let width = number_attribute(attrs, "Width")?;
    let height = number_attribute(attrs, "Height")?;
    (width > 0.0 && height > 0.0).then(|| StoryBoardCanvas {
        id: attrs.get("Id").or_else(|| attrs.get("id")).cloned(),
        width,
        height,
        zoom_level: number_attribute(attrs, "ZoomLevel"),
        scroll_origin: attrs.get("ScrollOrigin").cloned(),
    })
}

fn number_attribute(attrs: &Metadata, name: &str) -> Option<f64> {
    attrs
        .get(name)?
        .parse::<f64>()
        .ok()
        .filter(|value| value.is_finite())
}

fn append_paragraph(body: &mut String, paragraph: &str) {
    if !body.is_empty() {
        body.push('\n');
    }
    body.push_str(paragraph);
}

fn flush_outline(pending: &mut Option<StoryBeat>, beats: &mut Vec<StoryBeat>) {
    if let Some(beat) = pending.take() {
        push_beat(beats, beat);
    }
}

fn push_beat(beats: &mut Vec<StoryBeat>, beat: StoryBeat) {
    if let Some(existing) = beats.iter_mut().find(|existing| existing.id == beat.id) {
        if !beat.title.is_empty() {
            existing.title = beat.title;
        }
        if !beat.text.is_empty() {
            existing.text = beat.text;
        }
        if beat.color.is_some() {
            existing.color = beat.color;
        }
        if beat.board.is_some() {
            existing.board = beat.board;
        }
        return;
    }
    beats.push(beat);
}

fn derive_structure(
    blocks: &mut [ScreenplayBlock],
    warnings: &mut Vec<ImportWarning>,
) -> (Vec<Scene>, Vec<Character>, Vec<Location>) {
    let mut scenes = Vec::<Scene>::new();
    for (index, block) in blocks.iter().enumerate() {
        if block.block_type != BlockType::SceneHeading {
            continue;
        }
        if block.text.trim().is_empty() {
            warnings.push(warning(
                "MissingSceneHeadingText",
                "A scene heading has no text.",
                Some(index),
                true,
            ));
        }
        let (interior_exterior, location, time_of_day) = parse_heading(&block.text);
        let scene_number = block.metadata.get("Number").cloned();
        if let Some(number) = &scene_number {
            if scenes
                .iter()
                .any(|scene| scene.scene_number.as_ref() == Some(number))
            {
                warnings.push(warning(
                    "DuplicateSceneNumber",
                    format!("Scene number {number} appears more than once."),
                    Some(index),
                    true,
                ));
            }
        }
        let id = stable_id("scene", &block.id);
        if let Some(previous) = scenes.last_mut() {
            previous.block_end = index.saturating_sub(1);
        }
        scenes.push(Scene {
            id,
            scene_number,
            heading: block.text.trim().to_string(),
            interior_exterior,
            location,
            time_of_day,
            block_start: index,
            block_end: blocks.len().saturating_sub(1),
            character_ids: Vec::new(),
            metadata: block.metadata.clone(),
        });
    }

    let mut current_scene = None;
    for (index, block) in blocks.iter_mut().enumerate() {
        if block.block_type == BlockType::SceneHeading {
            current_scene = scenes
                .iter()
                .find(|scene| scene.block_start == index)
                .map(|scene| scene.id.clone());
        }
        block.scene_id = current_scene.clone();
    }

    let mut characters = Vec::<Character>::new();
    let mut current_character = None::<String>;
    for block in blocks.iter() {
        if block.block_type == BlockType::Character {
            let canonical = normalize_character(&block.text);
            if canonical.is_empty() {
                current_character = None;
                continue;
            }
            let character_id = stable_id("character", &canonical);
            let display = block.text.trim().to_string();
            let character =
                if let Some(found) = characters.iter_mut().find(|item| item.id == character_id) {
                    found
                } else {
                    characters.push(Character {
                        id: character_id.clone(),
                        canonical_name: canonical.clone(),
                        display_name: display.clone(),
                        aliases: Vec::new(),
                        first_appearance_block_id: block.id.clone(),
                        scene_ids: Vec::new(),
                        dialogue_block_ids: Vec::new(),
                    });
                    characters.last_mut().expect("just pushed")
                };
            if display.to_uppercase() != canonical && !character.aliases.contains(&display) {
                character.aliases.push(display);
            }
            if let Some(scene_id) = &block.scene_id {
                push_unique(&mut character.scene_ids, scene_id.clone());
                if let Some(scene) = scenes.iter_mut().find(|scene| &scene.id == scene_id) {
                    push_unique(&mut scene.character_ids, character_id.clone());
                }
            }
            current_character = Some(character_id);
        } else if block.block_type == BlockType::Dialogue {
            if let Some(character_id) = &current_character {
                if let Some(character) = characters.iter_mut().find(|item| &item.id == character_id)
                {
                    character.dialogue_block_ids.push(block.id.clone());
                }
            }
        } else if block.block_type != BlockType::Parenthetical {
            current_character = None;
        }
    }

    let mut locations = Vec::<Location>::new();
    for scene in &scenes {
        let Some(display) = scene.location.as_ref().filter(|value| !value.is_empty()) else {
            continue;
        };
        let canonical = display.trim().to_uppercase();
        let id = stable_id("location", &canonical);
        let location = if let Some(found) = locations.iter_mut().find(|item| item.id == id) {
            found
        } else {
            locations.push(Location {
                id,
                canonical_name: canonical,
                display_name: display.clone(),
                interior_exterior_usages: Vec::new(),
                scene_ids: Vec::new(),
            });
            locations.last_mut().expect("just pushed")
        };
        push_unique(&mut location.scene_ids, scene.id.clone());
        if let Some(value) = &scene.interior_exterior {
            push_unique(&mut location.interior_exterior_usages, value.clone());
        }
    }

    (scenes, characters, locations)
}

fn map_type(value: &str) -> BlockType {
    match value.trim().to_ascii_lowercase().as_str() {
        "scene heading" => BlockType::SceneHeading,
        "action" => BlockType::Action,
        "character" => BlockType::Character,
        "dialogue" => BlockType::Dialogue,
        "parenthetical" => BlockType::Parenthetical,
        "transition" => BlockType::Transition,
        "shot" => BlockType::Shot,
        "general" => BlockType::General,
        "lyrics" => BlockType::Lyrics,
        "cast list" => BlockType::CastList,
        "new act" => BlockType::NewAct,
        "end of act" => BlockType::EndOfAct,
        _ => BlockType::Unknown,
    }
}

fn parse_heading(heading: &str) -> (Option<String>, Option<String>, Option<String>) {
    let trimmed = heading.trim();
    let upper = trimmed.to_uppercase();
    let prefixes = [
        "INT./EXT.",
        "EXT./INT.",
        "INT/EXT",
        "EXT/INT",
        "I/E.",
        "EST.",
        "INT.",
        "EXT.",
        "INT",
        "EXT",
    ];
    let prefix = prefixes.iter().find(|prefix| upper.starts_with(**prefix));
    let rest = prefix.map_or(trimmed, |prefix| {
        trimmed[prefix.len()..]
            .trim_start_matches(['.', ' '])
            .trim()
    });
    let (location, time) = rest
        .rsplit_once(" - ")
        .map_or((rest, None), |(left, right)| {
            let known = [
                "DAY",
                "NIGHT",
                "MORNING",
                "AFTERNOON",
                "EVENING",
                "DAWN",
                "DUSK",
                "LATER",
                "CONTINUOUS",
                "SAME",
                "MOMENTS LATER",
            ];
            if known.contains(&right.trim().to_uppercase().as_str()) {
                (left, Some(right.trim()))
            } else {
                (rest, None)
            }
        });
    (
        prefix.map(|value| value.trim_end_matches('.').to_string()),
        (!location.trim().is_empty()).then(|| location.trim().to_string()),
        time.map(str::to_string),
    )
}

fn normalize_character(value: &str) -> String {
    let mut name = value.trim().trim_end_matches('^').trim().to_uppercase();
    while let Some(open) = name.rfind('(') {
        if !name.ends_with(')') {
            break;
        }
        let extension = &name[open + 1..name.len() - 1];
        if [
            "V.O.",
            "VO",
            "O.S.",
            "OS",
            "O.C.",
            "OC",
            "CONT'D",
            "CONT’D",
            "CONTINUED",
        ]
        .contains(&extension.trim())
        {
            name.truncate(open);
            name = name.trim().to_string();
        } else {
            break;
        }
    }
    name
}

fn text_run(metadata: Metadata) -> TextRun {
    let style = metadata
        .get("Style")
        .map(|value| value.to_ascii_lowercase())
        .unwrap_or_default();
    let yes = |key: &str| {
        metadata.get(key).is_some_and(|value| {
            matches!(value.to_ascii_lowercase().as_str(), "yes" | "true" | "1")
        })
    };
    TextRun {
        text: String::new(),
        bold: style.contains("bold") || yes("Bold"),
        italic: style.contains("italic") || yes("Italic"),
        underline: style.contains("underline") || yes("Underline"),
        strikeout: style.contains("strike") || yes("Strikeout"),
        revision_id: metadata.get("RevisionID").cloned(),
        metadata,
    }
}

fn attributes(
    tag: &quick_xml::events::BytesStart<'_>,
    reader: &Reader<&[u8]>,
) -> Result<Metadata, String> {
    tag.attributes()
        .map(|attribute| {
            let attribute =
                attribute.map_err(|e| format!("FDX contains a malformed attribute: {e}"))?;
            let key = String::from_utf8_lossy(attribute.key.as_ref()).to_string();
            let value = attribute
                .decode_and_unescape_value(reader.decoder())
                .map_err(|e| format!("FDX attribute could not be decoded: {e}"))?;
            Ok((key, value.into_owned()))
        })
        .collect()
}

fn friendly_io_error(path: &Path, error: std::io::Error) -> String {
    match error.kind() {
        std::io::ErrorKind::NotFound => {
            format!("The linked FDX file no longer exists: {}", path.display())
        }
        std::io::ErrorKind::PermissionDenied => {
            format!("SCS does not have permission to read: {}", path.display())
        }
        _ => format!("The FDX file could not be opened: {error}"),
    }
}

fn warning(
    code: &str,
    message: impl Into<String>,
    block_index: Option<usize>,
    data_preserved: bool,
) -> ImportWarning {
    ImportWarning {
        code: code.into(),
        message: message.into(),
        block_index,
        severity: "warning".into(),
        data_preserved,
    }
}

fn push_unique(values: &mut Vec<String>, value: String) {
    if !values.contains(&value) {
        values.push(value);
    }
}

fn stable_id(prefix: &str, input: &str) -> String {
    let mut hash = 0xcbf29ce484222325u64;
    for byte in input.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{prefix}-{hash:016x}")
}

pub fn now() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "unknown".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> Vec<u8> {
        std::fs::read(
            Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("test-fixtures")
                .join(name),
        )
        .unwrap()
    }

    #[test]
    fn parses_blocks_styles_scenes_characters_and_locations() {
        let doc = parse(
            &fixture("feature-common.fdx"),
            Path::new("feature-common.fdx"),
        )
        .unwrap();
        assert_eq!(doc.blocks[0].block_type, BlockType::SceneHeading);
        assert_eq!(
            doc.blocks[0].metadata.get("Number").map(String::as_str),
            Some("1")
        );
        assert!(doc.blocks[1].text_runs[0].bold);
        assert_eq!(
            doc.scenes[0].location.as_deref(),
            Some("WALSH HOUSE - KITCHEN")
        );
        assert_eq!(doc.scenes[0].time_of_day.as_deref(), Some("NIGHT"));
        assert_eq!(doc.characters[0].canonical_name, "MARA");
        assert_eq!(doc.characters[0].aliases, vec!["MARA (V.O.)"]);
        assert_eq!(doc.characters[0].dialogue_block_ids.len(), 1);
        assert_eq!(doc.locations[0].scene_ids.len(), 1);
        assert!(!serde_json::to_string(&doc)
            .unwrap()
            .contains("\"sceneHeading\""));
    }

    #[test]
    fn character_extensions_share_one_character_and_keep_dialogue_links() {
        let doc = parse(
            &fixture("character-extensions.fdx"),
            Path::new("character-extensions.fdx"),
        )
        .unwrap();
        assert_eq!(doc.characters.len(), 1);
        assert_eq!(doc.characters[0].canonical_name, "JUNE");
        assert_eq!(doc.characters[0].aliases, vec!["JUNE (O.S.) (CONT'D)"]);
        assert_eq!(doc.characters[0].dialogue_block_ids.len(), 2);
        assert_eq!(
            doc.scenes[0].character_ids,
            vec![doc.characters[0].id.clone()]
        );
    }

    #[test]
    fn empty_paragraphs_are_preserved_with_a_warning() {
        let doc = parse(&fixture("empty.fdx"), Path::new("empty.fdx")).unwrap();
        assert_eq!(doc.blocks.len(), 1);
        assert_eq!(doc.blocks[0].text, "");
        assert_eq!(doc.blocks[0].text_runs.len(), 1);
        assert!(doc
            .warnings
            .iter()
            .any(|warning| warning.code == "EmptyParagraph" && warning.data_preserved));
    }

    #[test]
    fn scene_numbers_and_duplicates_are_preserved() {
        let doc = parse(
            &fixture("scene-numbers.fdx"),
            Path::new("scene-numbers.fdx"),
        )
        .unwrap();
        assert_eq!(doc.scenes.len(), 2);
        assert!(doc
            .scenes
            .iter()
            .all(|scene| scene.scene_number.as_deref() == Some("12A")));
        assert_eq!(
            doc.blocks[0].metadata.get("Number").map(String::as_str),
            Some("12A")
        );
        assert!(doc.warnings.iter().any(|warning| {
            warning.code == "DuplicateSceneNumber" && warning.block_index == Some(2)
        }));
    }

    #[test]
    fn styled_text_runs_and_revision_ids_are_preserved() {
        let doc = parse(&fixture("styled-text.fdx"), Path::new("styled-text.fdx")).unwrap();
        let block = &doc.blocks[0];
        assert_eq!(block.text, "Bold italic then revised.");
        assert_eq!(block.text_runs.len(), 2);
        assert!(block.text_runs[0].bold && block.text_runs[0].italic);
        assert_eq!(block.text_runs[0].revision_id.as_deref(), Some("2"));
        assert!(block.text_runs[1].underline && block.text_runs[1].strikeout);
        assert_eq!(
            block.text_runs[1].metadata.get("Style").map(String::as_str),
            Some("Underline+Strikeout")
        );
    }

    #[test]
    fn second_television_episode_derives_title_cast_and_location() {
        let doc = parse(
            &fixture("television-episode-2.fdx"),
            Path::new("television-episode-2.fdx"),
        )
        .unwrap();
        assert_eq!(doc.title_page.title, "Episode 2");
        assert_eq!(doc.scenes.len(), 1);
        assert_eq!(doc.characters.len(), 2);
        assert_eq!(doc.characters[0].canonical_name, "ELI");
        assert_eq!(doc.characters[0].aliases, vec!["ELI (V.O.)"]);
        assert_eq!(doc.characters[0].dialogue_block_ids.len(), 1);
        assert_eq!(doc.locations[0].canonical_name, "NEWSROOM ROOF");
    }

    #[test]
    fn unusual_scene_heading_prefixes_remain_conservative() {
        let doc = parse(
            &fixture("unusual-headings.fdx"),
            Path::new("unusual-headings.fdx"),
        )
        .unwrap();
        assert_eq!(doc.scenes.len(), 3);
        assert_eq!(doc.scenes[0].interior_exterior.as_deref(), Some("I/E"));
        assert_eq!(doc.scenes[0].location.as_deref(), Some("SUBMARINE"));
        assert_eq!(doc.scenes[0].time_of_day.as_deref(), Some("DAWN"));
        assert_eq!(doc.scenes[1].interior_exterior.as_deref(), Some("EXT./INT"));
        assert_eq!(doc.scenes[1].location.as_deref(), Some("MOVING CAR"));
        assert_eq!(doc.scenes[2].interior_exterior, None);
        assert_eq!(
            doc.scenes[2].location.as_deref(),
            Some("SOMEWHERE BEYOND TIME")
        );
    }

    #[test]
    fn unknown_types_are_preserved_with_a_warning() {
        let doc = parse(&fixture("unknown-paragraph.fdx"), Path::new("unknown.fdx")).unwrap();
        assert_eq!(doc.blocks[1].block_type, BlockType::Unknown);
        assert_eq!(doc.blocks[1].original_type, "Montage Beat");
        assert!(doc
            .warnings
            .iter()
            .any(|warning| warning.code == "UnknownParagraphType"));
    }

    #[test]
    fn beat_board_and_outline_content_stay_out_of_screenplay_blocks() {
        let doc = parse(&fixture("beat-board.fdx"), Path::new("beat-board.fdx")).unwrap();
        assert_eq!(
            doc.blocks
                .iter()
                .map(|block| block.text.as_str())
                .collect::<Vec<_>>(),
            vec!["FADE IN:", "INT. ROOM - NIGHT", "The screenplay continues."]
        );

        let structure = &doc.workspace.story_structure;
        assert_eq!(structure.scene_order, vec!["scene-1"]);
        assert_eq!(structure.beats.len(), 3);
        assert_eq!(structure.beats[0].title, "Imported outline");
        assert_eq!(
            structure.beats[0].text,
            "This belongs in the outline, not on the screenplay page."
        );
        let first = structure
            .beats
            .iter()
            .find(|beat| beat.id == "beat-a")
            .unwrap();
        assert_eq!(first.title, "First beat");
        assert_eq!(first.text, "First body line.\nSecond body line.");
        assert_eq!(first.color.as_deref(), Some("#AAAABBBBCCCC"));
        assert_eq!(first.board.as_ref().map(|rect| rect.left), Some(60.0));
        assert_eq!(structure.connections.len(), 1);
        assert_eq!(structure.connections[0].from_id, "beat-a");
        assert_eq!(structure.connections[0].to_id, "beat-b");
        assert_eq!(
            structure.connections[0]
                .board
                .as_ref()
                .map(|rect| rect.width),
            Some(160.0)
        );
        assert_eq!(
            structure
                .board
                .as_ref()
                .and_then(|board| board.id.as_deref()),
            Some("board-1")
        );
        assert_eq!(
            structure.board.as_ref().map(|board| board.width),
            Some(2000.0)
        );
        assert_eq!(
            structure.board.as_ref().and_then(|board| board.zoom_level),
            Some(110.5)
        );
        assert!(!doc
            .warnings
            .iter()
            .any(|warning| warning.message.contains("Header text")));
    }

    #[test]
    fn beat_board_records_are_scoped_to_root_fdx_containers() {
        let xml = br##"<?xml version="1.0" encoding="UTF-8"?>
<FinalDraft Version="6">
  <Content><Paragraph Type="Action" Id="action-1"><Text>Script text.</Text></Paragraph></Content>
  <ListItems>
    <ListItem Id="root-beat" Title="Root beat" Type="Beat">
      <Content>
        <Paragraph><Text>Root body.</Text></Paragraph>
        <Extension><ListItems><ListItem Id="nested-beat" Title="Nested beat" Type="Beat"><Content><Paragraph><Text>Ignore me.</Text></Paragraph></Content></ListItem></ListItems></Extension>
      </Content>
    </ListItem>
  </ListItems>
  <DisplayBoards><DisplayBoard Height="800" Id="root-board" Type="Beat" Width="1200"><Item Height="100" Id="root-beat" Left="20" Top="30" Width="200"/></DisplayBoard></DisplayBoards>
  <HeaderAndFooter>
    <ListItems><ListItem Id="header-beat" Title="Header beat" Type="Beat"><Content><Paragraph><Text>Ignore me too.</Text></Paragraph></Content></ListItem></ListItems>
    <DisplayBoards><DisplayBoard Height="999" Id="header-board" Type="Beat" Width="999"><Item Height="50" Id="header-beat" Left="1" Top="1" Width="50"/></DisplayBoard></DisplayBoards>
  </HeaderAndFooter>
</FinalDraft>"##;

        let doc = parse(xml, Path::new("scoped-board.fdx")).unwrap();
        let structure = &doc.workspace.story_structure;
        assert_eq!(structure.beats.len(), 1);
        assert_eq!(structure.beats[0].id, "root-beat");
        assert_eq!(structure.beats[0].text, "Root body.");
        assert_eq!(
            structure
                .board
                .as_ref()
                .and_then(|board| board.id.as_deref()),
            Some("root-board")
        );
        assert_eq!(
            structure.beats[0].board.as_ref().map(|rect| rect.width),
            Some(200.0)
        );
    }

    #[test]
    fn malformed_xml_fails_safely() {
        assert!(parse(&fixture("malformed.fdx"), Path::new("bad.fdx"))
            .unwrap_err()
            .contains("valid FDX XML"));
    }

    #[test]
    fn heading_and_character_normalization_are_conservative() {
        assert_eq!(normalize_character(" Mara (V.O.) (CONT'D) ^"), "MARA");
        assert_eq!(
            parse_heading("EXT./INT. MOVING CAR - NIGHT"),
            (
                Some("EXT./INT".into()),
                Some("MOVING CAR".into()),
                Some("NIGHT".into())
            )
        );
        assert_eq!(
            parse_heading("WAREHOUSE - UNKNOWN SECTOR"),
            (None, Some("WAREHOUSE - UNKNOWN SECTOR".into()), None)
        );
    }
}
