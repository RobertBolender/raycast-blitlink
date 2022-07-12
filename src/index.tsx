import { ActionPanel, Action, Clipboard, Detail, Form, List, showToast, Toast, environment, useNavigation } from "@raycast/api";
import { useState, useEffect, useRef, useCallback } from "react";
import path from "path";
import { promisify } from "util";

const exec = promisify(require('child_process').exec);
const LINK_FILE_NAME = "blitlinks.db";

export default function Command() {
  const { state, search } = useSearch();
  return (
    <List
      isLoading={state.isLoading}
      onSearchTextChange={search}
      searchBarPlaceholder="Search for a saved link..."
    >
      {state.results.map((searchResult) => (
        <SearchListItem key={searchResult.rowid} searchResult={searchResult} onEdit={search} />
      ))}
      {!state.searchText && state.results.length === 0 && (
        <List.EmptyView title="Type or paste your first link to get started!" icon="BlitLink.png" />
      )}
      {!!state.searchText && state.results.length === 0 && (
        <List.EmptyView title="No matches found" description="Save as a new link?" actions={
          <ActionPanel>
            <Action.Push title="Save link" target={<EditForm text={state.searchText ?? ""} onEdit={search} />} />
          </ActionPanel>
        } />
      )
      }
    </List>
  );
}

function SearchListItem({ searchResult, onEdit }: { searchResult: SearchResult, onEdit: (text: string) => void }) {
  const { push } = useNavigation();
  return (
    <List.Item
      title={searchResult.text ?? ""}
      subtitle={searchResult.link}
      accessories={[{ text: searchResult.shortcut }]}
      detail={<List.Item.Detail markdown={`![](${searchResult.link})\n\n<b>${searchResult.shortcut}</b>\n${searchResult.title}`} />}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {searchResult.link && (
              <>
                <Action.OpenInBrowser title="Open in Browser" url={searchResult.link} />
                <Action title="Copy link and Preview Image" onAction={() => previewAndCopy(push, searchResult)} />
              </>
            )}
            <Action.Push title="Edit link" target={<EditForm {...searchResult} onEdit={onEdit} />} />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy plain URL"
              content={`${searchResult.link}`}
            />
            <Action.CopyToClipboard
              title="Copy markdown link"
              content={`[${searchResult.title}](${searchResult.link})`}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function EditForm(props: { rowid?: string, text?: string, link?: string, title?: string, shortcut?: string, onEdit: (text: string) => void }) {
  const { rowid = "", text, link, title, shortcut, onEdit } = props;

  const { pop } = useNavigation();

  async function handleSubmit(values: SearchResult) {
    const { text = "", link = "", title = "", shortcut = "" } = values;
    await appendLink(rowid, text, link, title, shortcut);
    onEdit(text);
    pop();
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save link"
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="text" title="Text" defaultValue={text ?? ""} />
      <Form.TextField id="link" title="Link" defaultValue={link ?? ""} />
      <Form.TextField id="title" title="Title" defaultValue={title ?? ""} />
      <Form.TextField id="shortcut" title="Shortcut" defaultValue={shortcut ?? ""} />
    </Form>
  )
}

function previewAndCopy(push: (view: JSX.Element) => void, searchResult: SearchResult) {
  Clipboard.copy(searchResult.link!);
  showToast({ style: Toast.Style.Success, title: "Copied link to clipboard" });
  push(<Detail markdown={`![](${searchResult.link})`} />)
}

function useSearch() {
  const [state, setState] = useState<SearchState>({ results: [], isLoading: true });
  const cancelRef = useRef<AbortController | null>(null);

  const search = useCallback(
    async function search(searchText: string) {
      cancelRef.current?.abort();
      cancelRef.current = new AbortController();
      setState((oldState) => ({
        ...oldState,
        searchText,
        isLoading: true,
      }));

      try {
        const results = await performSearch(searchText);
        setState(() => ({
          results,
          searchText,
          isLoading: false
        }));
      } catch (error) {
        setState((oldState) => ({
          ...oldState,
          isLoading: false,
        }));

        console.error("file error", error);
        showToast({ style: Toast.Style.Failure, title: "Could not open links file", message: String(error) });
      }
    },
    [cancelRef, setState]
  );

  useEffect(() => {
    search("");
    return () => {
      cancelRef.current?.abort();
    };
  }, []);

  return {
    state: state,
    search: search,
  };
}

async function appendLink(rowid: string, text: string, link: string, title: string, shortcut: string) {
  if (rowid) {
    const results = await exec(`sqlite3 "${getLinkFileName()}" "update blitlinks set text='${escape(text)}', link='${escape(link)}', title='${escape(title)}', shortcut='${escape(shortcut)}' where rowid=${rowid};"`);
    console.log({ results })
    showToast({ style: Toast.Style.Success, title: "Link updated" });
  } else {
    const results = await exec(`sqlite3 "${getLinkFileName()}" "insert into blitlinks(text, link, title, shortcut) values('${escape(text)}', '${escape(link)}', '${escape(title)}', '${escape(shortcut)}')"`);
    console.log({ results })
    showToast({ style: Toast.Style.Success, title: "Link saved" });
  }
}

async function performSearch(query: string): Promise<any> {
  var results = {} as any;

  if (!query || !query.trim()) {
    results = await exec(`sqlite3 "${getLinkFileName()}" -json "select rowid, text, link, title, shortcut from blitlinks order by rowid desc;"`);
  } else {
    query = query.replace(/[^a-zA-Z0-9]/g, " ");
    results = await exec(`sqlite3 "${getLinkFileName()}" -json "select rowid, text, link, title, shortcut from blitlinks where blitlinks match 'shortcut : ${escape(query)} OR ${escape(query)}*' order by rank"`);
  }
  if (!results.stdout) return [];

  try {
    const json = JSON.parse(results.stdout);
    console.log(json);
    return json;
  } catch (e) {
    console.error(e);
    return [];
  }
}

function getLinkFileName() {
  return path.resolve(environment.supportPath, LINK_FILE_NAME);
}

function escape(input: string) {
  return input.replace(/[\\$"]/g, "\\$&").replace(/[']/g, "''");
}

interface SearchState {
  results: SearchResult[];
  searchText?: string;
  isLoading: boolean;
}

interface SearchResult {
  rowid?: string;
  text?: string;
  link?: string;
  title?: string;
  shortcut?: string;
}
