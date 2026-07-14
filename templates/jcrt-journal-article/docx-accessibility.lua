local stringify = pandoc.utils.stringify

local function text(value)
  if value == nil then return "" end
  return stringify(value)
end

local function values(value)
  if value == nil then return {} end
  if pandoc.utils.type(value) == "List" then
    local result = {}
    for _, item in ipairs(value) do result[#result + 1] = text(item) end
    return result
  end
  return {text(value)}
end

local function paragraph(content)
  return pandoc.Para(type(content) == "string" and {pandoc.Str(content)} or content)
end

local function heading(level, content, identifier)
  return pandoc.Header(level, type(content) == "string" and {pandoc.Str(content)} or content, pandoc.Attr(identifier or ""))
end

function Pandoc(doc)
  local meta = doc.meta
  local title = text(meta.title)
  local normalized_title = title:lower():gsub("%s+", " "):gsub("^%s+", ""):gsub("%s+$", "")
  local blocks = {}
  for _, block in ipairs(doc.blocks) do
    local is_duplicate_title = block.t == "Header"
      and text(block.content):lower():gsub("%s+", " "):gsub("^%s+", ""):gsub("%s+$", "") == normalized_title
    if not is_duplicate_title then blocks[#blocks + 1] = block end
  end
  doc.blocks = blocks

  if FORMAT ~= "docx" then return doc end

  local authors = table.concat(values(meta.author), "; ")
  local volume_issue = text(meta.volume) .. "." .. text(meta.issue)
  local season = text(meta.season)
  local abstract = text(meta.abstract)
  if abstract == "" then abstract = text(meta.description) end
  local keywords = table.concat(values(meta.keywords), ", ")
  local year = text(meta["copyright-year"])
  if year == "" then year = text(meta.year) end
  local rights_holder = text(meta["rights-holder"])
  if rights_holder == "" then rights_holder = authors end
  local publisher = text(meta.publisher)
  if publisher == "" then publisher = "Whitestone Publications" end
  local issn = text(meta.issn)
  if issn == "" then issn = "1530-5228" end
  local license = text(meta.license)
  if license == "" then license = "CC BY 4.0" end
  local license_url = text(meta["license-url"])
  if license_url == "" then license_url = "https://creativecommons.org/licenses/by/4.0/" end
  if meta.lang == nil then meta.lang = pandoc.MetaString("en-US") end
  if meta.subject == nil and abstract ~= "" then meta.subject = pandoc.MetaString(abstract) end
  if meta.rights == nil then
    meta.rights = pandoc.MetaString("Copyright " .. year .. " " .. rights_holder .. ". " .. license .. ".")
  end

  local cover = {}
  local alt = "a 2x2 grid with alternating black and red squares the letters JCRT. one letter per square in high contrast."
  cover[#cover + 1] = paragraph({pandoc.Image({pandoc.Str(alt)}, text(meta.logo), "", pandoc.Attr("jcrt-logo", {}, {{"width", "0.9in"}}))})
  cover[#cover + 1] = paragraph("The Journal for Cultural and Religious Theory (JCRT)")
  cover[#cover + 1] = paragraph(volume_issue .. " | " .. season)
  -- Pandoc applies --shift-heading-level-by=-1 after this filter.
  cover[#cover + 1] = heading(2, title, "jcrt-article-title")
  cover[#cover + 1] = paragraph(authors)

  if text(meta.affiliation) ~= "" then
    cover[#cover + 1] = paragraph({pandoc.Emph({pandoc.Str(text(meta.affiliation))})})
  end
  if text(meta.url) ~= "" then
    cover[#cover + 1] = paragraph({
      pandoc.Link({pandoc.Str("Read this article on JCRT")}, text(meta.url)),
      pandoc.LineBreak(),
      pandoc.Str(text(meta.url))
    })
  end
  if abstract ~= "" then
    cover[#cover + 1] = heading(3, "Abstract", "jcrt-abstract")
    cover[#cover + 1] = paragraph(abstract)
    if keywords ~= "" then
      cover[#cover + 1] = paragraph({pandoc.Emph({pandoc.Str("Keywords: " .. keywords)})})
    end
  end

  cover[#cover + 1] = pandoc.HorizontalRule()
  local copyright = "Copyright " .. year .. " " .. rights_holder .. ". Published by " .. publisher .. ". ISSN " .. issn .. ". Licensed under "
  cover[#cover + 1] = paragraph({pandoc.Str(copyright), pandoc.Link({pandoc.Str(license)}, license_url), pandoc.Str(".")})
  cover[#cover + 1] = pandoc.RawBlock("openxml", '<w:p><w:r><w:br w:type="page"/></w:r></w:p>')

  for i = #cover, 1, -1 do table.insert(doc.blocks, 1, cover[i]) end
  return doc
end
