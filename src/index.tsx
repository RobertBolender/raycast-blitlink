import { ActionPanel, Action, Clipboard, Detail, List, showToast, Toast, environment, useNavigation } from "@raycast/api";
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
      enableFiltering
    >
      {state.results.map((searchResult) => (
        <SearchListItem key={searchResult.title} searchResult={searchResult} />
      ))}
      {!state.searchText && state.results.length === 0 && (
        <List.EmptyView title="Type or paste your first link to get started!" icon="BlitLink.png" />
      )}
      {!!state.searchText && state.results.length === 0 && (
        <List.EmptyView title="No matches found" description="Save as a new link?" actions={
          <ActionPanel>
            <Action title="Save link" onAction={() => appendLink(state.searchText ?? "")} />
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
      title={searchResult.title}
      keywords={searchResult.keywords}
      detail={<List.Item.Detail markdown={`![](${searchResult.url})\n\nKeywords:\n${searchResult.keywords?.join(' ')}`} />}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action.OpenInBrowser title="Open in Browser" url={searchResult.url} />
            <Action title="Copy link and Preview Image" onAction={() => previewAndCopy(push, searchResult)} />
          </ActionPanel.Section>
          <ActionPanel.Section>
            <Action.CopyToClipboard
              title="Copy plain URL"
              content={`${searchResult.url}`}
            />
            <Action.CopyToClipboard
              title="Copy markdown link"
              content={`[${searchResult.title}](${searchResult.url})`}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

function previewAndCopy(push: (view: JSX.Element) => void, searchResult: SearchResult) {
  Clipboard.copy(searchResult.url);
  showToast({ style: Toast.Style.Success, title: "Copied link to clipboard" });
  push(<Detail markdown={`![](${searchResult.url})`} />)
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
        const results = await performSearch();
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

async function appendLink(link: string) {
  showToast({ style: Toast.Style.Failure, title: "Not yet implemented" });
}

async function performSearch(): Promise<any> {
  const results = await exec(`~/code/go-blitlink/go-blitlink "${getLinkFileName()}" query github`);
  const json = JSON.parse(results.stdout);
  return json;
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
  title: string;
  keywords?: string[];
  url: string;
}
