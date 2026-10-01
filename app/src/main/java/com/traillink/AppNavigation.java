package com.traillink;

/** Contextual return paths, independent of rendering and asynchronous engine updates. */
final class AppNavigation {
    private String gameParent = "home", reviewParent = "home";
    void enterGame(String from, boolean lesson) {
        if (lesson) gameParent = "learn";
        else if (isTab(from)) gameParent = from;
    }
    void enterReview(boolean archive, boolean live) {
        reviewParent = archive ? "history" : live ? "game" : "home";
    }
    String back(String screen) {
        if (screen.equals("review")) return reviewParent;
        if (screen.equals("game")) return gameParent;
        if (screen.equals("puzzle")) return "learn";
        return screen.equals("home") ? "exit" : "home";
    }
    private static boolean isTab(String screen) {
        return screen.equals("home") || screen.equals("play") || screen.equals("learn")
                || screen.equals("history") || screen.equals("profile");
    }
}
