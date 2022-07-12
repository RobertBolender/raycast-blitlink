import { ActionPanel, Action, Clipboard, Detail, Form, List, showToast, Toast, environment, useNavigation, popToRoot } from "@raycast/api";
import { useState, useEffect, useRef, useCallback } from "react";
import path from "path";
import { promisify } from "util";

const exec = promisify(require('child_process').exec);
const BLITLINK_PATH = "~/code/go-blitlink/go-blitlink";
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
        <SearchListItem key={searchResult.id} searchResult={searchResult} />
      ))}
      {!state.searchText && state.results.length === 0 && (
        <List.EmptyView title="Type or paste your first link to get started!" icon="BlitLink.png" />
      )}
      {!!state.searchText && state.results.length === 0 && (
        <List.EmptyView title="No matches found" description="Save as a new link?" actions={
          <ActionPanel>
            <Action.Push title="Save link" target={<EditForm text={state.searchText ?? ""} />} />
          </ActionPanel>
        } />
      )
      }
    </List>
  );
}

function SearchListItem({ searchResult }: { searchResult: SearchResult }) {
  const { push } = useNavigation();
  return (
    <List.Item
      title={searchResult.text ?? ""}
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
            <Action.Push title="Edit link" target={<EditForm {...searchResult} />} />
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

function EditForm(props: { text?: string, link?: string, title?: string, shortcut?: string }) {
  const { text, link, title, shortcut } = props;

  const { pop } = useNavigation();

  async function handleSubmit(values: SearchResult) {
    const { text = "", link = "", title = "", shortcut = "" } = values;
    console.log({ values })
    await appendLink(text, link, title, shortcut);
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
      <Form.TextField id="text" title="Text" value={text ?? ""} />
      <Form.TextField id="link" title="Link" value={link ?? ""} />
      <Form.TextField id="title" title="Title" value={title ?? ""} />
      <Form.TextField id="shortcut" title="Shortcut" value={shortcut ?? ""} />
    </Form>
  )
}

function previewAndCopy(push: (view: JSX.Element) => void, searchResult: SearchResult) {
  Clipboard.copy(searchResult.link!);
  showToast({ style: Toast.Style.Success, title: "Copied link to clipboard" });
  push(<Detail markdown={`![](${searchResult.link})`} />)
}

function useSearch() {
  const [state, setState] = useState<SearchState>({ results: [], isLoading: false });
  const cancelRef = useRef<AbortController | null>(null);

  const search = useCallback(
    async function search(searchText: string) {
      cancelRef.current?.abort();
      cancelRef.current = new AbortController();
      setState((oldState) => ({
        ...oldState,
        searchText,
        isLoading: false,
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

async function appendLink(text: string, link: string, title: string, shortcut: string) {
  const results = await exec(`${BLITLINK_PATH} "${getLinkFileName()}" insert "${text}" "${link}" "${title}" "${shortcut}"`);
  console.log({ results })
  showToast({ style: Toast.Style.Success, title: "Link saved" });
}

async function performSearch(query: string): Promise<any> {
  const results = await exec(`${BLITLINK_PATH} "${getLinkFileName()}" query t`);
  const json = JSON.parse(results.stdout);
  const items = json.map((item: any) => {
    const [id, text, link, title, shortcut] = item;
    return { id, text, link, title, shortcut }
  });
  return items;
}

function getLinkFileName() {
  return path.resolve(environment.supportPath, LINK_FILE_NAME);
}

interface SearchState {
  results: SearchResult[];
  searchText?: string;
  isLoading: boolean;
}

interface SearchResult {
  id?: string;
  text?: string;
  link?: string;
  title?: string;
  shortcut?: string;
}
