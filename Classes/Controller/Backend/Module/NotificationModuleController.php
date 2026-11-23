<?php

declare(strict_types=1);

namespace UpAssist\Neos\EditorNotifications\Controller\Backend\Module;

use Neos\Error\Messages\Message;
use Neos\Flow\Annotations as Flow;
use Neos\Flow\I18n\Locale;
use Neos\Flow\I18n\Translator;
use Neos\Fusion\View\FusionView;
use Neos\Neos\Controller\Module\AbstractModuleController;
use Neos\Neos\Domain\Service\UserService;
use Neos\Flow\Persistence\PersistenceManagerInterface;
use UpAssist\Neos\EditorNotifications\Domain\Model\Notification;
use UpAssist\Neos\EditorNotifications\Domain\Repository\NotificationRepository;
use UpAssist\Neos\EditorNotifications\Service\NotificationService;

class NotificationModuleController extends AbstractModuleController
{
    private const TRANSLATION_SOURCE = 'Main';
    private const TRANSLATION_PACKAGE = 'UpAssist.Neos.EditorNotifications';
    private const TIMEZONE_COOKIE = 'est_notifications_tz';

    private ?\DateTimeZone $displayTimeZone = null;

    protected $defaultViewObjectName = FusionView::class;

    /**
     * @Flow\Inject
     * @var NotificationRepository
     */
    protected $notificationRepository;

    /**
     * @Flow\Inject
     * @var NotificationService
     */
    protected $notificationService;

    /**
     * @Flow\Inject
     * @var PersistenceManagerInterface
     */
    protected $persistenceManager;

    /**
     * @Flow\Inject
     * @var Translator
     */
    protected $translator;

    /**
     * @Flow\Inject
     * @var UserService
     */
    protected $userService;

    protected function initializeView($view): void
    {
        parent::initializeView($view);
        $view->assign('interfaceLanguage', $this->getInterfaceLanguage());
    }

    public function indexAction(string $filter = 'active', int $page = 1): void
    {
        $page = max(1, $page);
        $pageSize = 10;
        $totalCount = $this->notificationRepository->countByFilter($filter);
        $pageCount = max(1, (int)ceil($totalCount / $pageSize));
        $page = min($page, $pageCount);
        $notifications = $this->notificationRepository->findByFilter($filter, $pageSize, ($page - 1) * $pageSize);

        $filterNames = ['active', 'scheduled', 'draft', 'expired', 'archived'];
        $filters = [];
        foreach ($filterNames as $name) {
            $filters[] = [
                'value' => $name,
                'label' => $this->translate('filter.' . $name),
                'count' => $this->notificationRepository->countByFilter($name),
            ];
        }

        $this->view->assignMultiple([
            'filter' => $filter,
            'filters' => $filters,
            'notifications' => array_map(fn(Notification $notification) => $this->mapNotificationForList($notification), $notifications),
            'page' => $page,
            'pageCount' => $pageCount,
            'pageNumbers' => range(1, $pageCount),
            'totalCount' => $totalCount,
            'flashMessages' => $this->controllerContext->getFlashMessageContainer()->getMessagesAndFlush(),
        ]);
    }

    public function newAction(array $formData = [], array $validationErrors = []): void
    {
        $this->view->assignMultiple([
            'mode' => 'new',
            'notification' => null,
            'formData' => $this->normalizeFormData($formData),
            'validationErrors' => $validationErrors,
            'flashMessages' => $this->controllerContext->getFlashMessageContainer()->getMessagesAndFlush(),
        ]);
    }

    public function createAction(string $title, string $content = '', string $showFrom = '', string $showUntil = ''): void
    {
        $showFromDate = $this->parseDateTime($showFrom);
        $showUntilDate = $this->parseDateTime($showUntil);
        $result = $this->notificationService->createNotification($title, $content, $showFromDate, $showUntilDate);

        if ($result['errors'] !== []) {
            $this->forward('new', null, null, [
                'formData' => compact('title', 'content', 'showFrom', 'showUntil'),
                'validationErrors' => $result['errors'],
            ]);
            return;
        }

        $this->addFlashMessage($this->translate('flash.created'));
        $this->redirect('edit', null, null, [
            'notificationIdentifier' => $this->persistenceManager->getIdentifierByObject($result['notification']),
        ]);
    }

    public function editAction(string $notificationIdentifier, array $formData = [], array $validationErrors = []): void
    {
        $notification = $this->requireNotification($notificationIdentifier);

        $this->view->assignMultiple([
            'mode' => 'edit',
            'notification' => $this->mapNotificationForEditor($notification),
            'formData' => $this->normalizeFormData($formData === [] ? $this->buildFormDataFromNotification($notification) : $formData),
            'validationErrors' => $validationErrors,
            'flashMessages' => $this->controllerContext->getFlashMessageContainer()->getMessagesAndFlush(),
        ]);
    }

    public function updateAction(string $notificationIdentifier, string $title, string $content = '', string $showFrom = '', string $showUntil = ''): void
    {
        $notification = $this->requireNotification($notificationIdentifier);
        $showFromDate = $this->parseDateTime($showFrom);
        $showUntilDate = $this->parseDateTime($showUntil);
        $result = $this->notificationService->updateNotification($notification, $title, $content, $showFromDate, $showUntilDate);

        if ($result['errors'] !== []) {
            $this->forward('edit', null, null, [
                'notificationIdentifier' => $notificationIdentifier,
                'formData' => compact('title', 'content', 'showFrom', 'showUntil'),
                'validationErrors' => $result['errors'],
            ]);
            return;
        }

        $this->addFlashMessage($this->translate('flash.updated'));
        $this->redirect('edit', null, null, ['notificationIdentifier' => $notificationIdentifier]);
    }

    public function createAndPublishAction(string $title, string $content = '', string $showFrom = '', string $showUntil = ''): void
    {
        $showFromDate = $this->parseDateTime($showFrom);
        $showUntilDate = $this->parseDateTime($showUntil);
        $result = $this->notificationService->createNotification($title, $content, $showFromDate, $showUntilDate);

        if ($result['errors'] !== []) {
            $this->forward('new', null, null, [
                'formData' => compact('title', 'content', 'showFrom', 'showUntil'),
                'validationErrors' => $result['errors'],
            ]);
            return;
        }

        $this->notificationService->publish($result['notification']);
        $this->addFlashMessage($this->translate('flash.createdAndPublished'));
        $this->redirect('index');
    }

    public function publishAction(string $notificationIdentifier): void
    {
        $this->notificationService->publish($this->requireNotification($notificationIdentifier));
        $this->addFlashMessage($this->translate('flash.published'));
        $this->redirect('edit', null, null, ['notificationIdentifier' => $notificationIdentifier]);
    }

    public function unpublishAction(string $notificationIdentifier): void
    {
        $this->notificationService->unpublish($this->requireNotification($notificationIdentifier));
        $this->addFlashMessage($this->translate('flash.unpublished'));
        $this->redirect('edit', null, null, ['notificationIdentifier' => $notificationIdentifier]);
    }

    public function archiveAction(string $notificationIdentifier): void
    {
        $this->notificationService->archive($this->requireNotification($notificationIdentifier));
        $this->addFlashMessage($this->translate('flash.archived'));
        $this->redirect('index', null, null, ['filter' => 'archived']);
    }

    public function deleteAction(string $notificationIdentifier): void
    {
        $notification = $this->requireNotification($notificationIdentifier);
        if ($notification->isActive(new \DateTime())) {
            $this->addFlashMessage($this->translate('flash.cannotDeleteActive'), '', Message::SEVERITY_WARNING);
            $this->redirect('index');
            return;
        }

        $this->notificationService->delete($notification);
        $this->addFlashMessage($this->translate('flash.deleted'));
        $this->redirect('index');
    }

    private function requireNotification(string $notificationIdentifier): Notification
    {
        $notification = $this->notificationRepository->findByIdentifier($notificationIdentifier);
        if (!$notification instanceof Notification) {
            throw new \Neos\Flow\Mvc\Exception\StopActionException();
        }

        return $notification;
    }

    /**
     * @return array<string, mixed>
     */
    private function mapNotificationForList(Notification $notification): array
    {
        $identifier = $this->persistenceManager->getIdentifierByObject($notification);
        $now = new \DateTime();
        $statusKey = 'draft';
        $status = $this->translate('status.draft');
        $statusHint = $this->translate('statusHint.draft');
        if ($notification->isArchived()) {
            $statusKey = 'archived';
            $status = $this->translate('status.archived');
            $statusHint = $this->translate('statusHint.archived');
        } elseif ($notification->isScheduled($now)) {
            $statusKey = 'scheduled';
            $status = $this->translate('status.scheduled');
            $statusHint = $this->translate('statusHint.scheduled', [$this->formatDate($notification->getShowFrom())]);
        } elseif ($notification->isExpired($now)) {
            $statusKey = 'expired';
            $status = $this->translate('status.expired');
            $statusHint = $this->translate('statusHint.expired', [$this->formatDate($notification->getShowUntil())]);
        } elseif ($notification->isActive($now)) {
            $statusKey = 'active';
            $status = $this->translate('status.published');
            $statusHint = $this->translate('statusHint.published');
        }

        return [
            'identifier' => $identifier,
            'title' => $notification->getTitle(),
            'status' => $status,
            'statusKey' => $statusKey,
            'statusHint' => $statusHint,
            'createdAt' => $this->formatDate($notification->getCreatedAt()),
            'publishedAt' => $this->formatDate($notification->getPublishedAt()) ?? $this->translate('statusHint.notPublished'),
            'showWindow' => $this->formatShowWindow($notification),
            'isDraft' => $notification->isDraft(),
            'isArchived' => $notification->isArchived(),
            'isPublished' => !$notification->isDraft(),
            'canDelete' => $statusKey !== 'active',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function mapNotificationForEditor(Notification $notification): array
    {
        $mapped = $this->mapNotificationForList($notification);
        $mapped['content'] = $notification->getContent();
        $mapped['showFromRaw'] = $this->formatDate($notification->getShowFrom(), 'Y-m-d\TH:i') ?? '';
        $mapped['showUntilRaw'] = $this->formatDate($notification->getShowUntil(), 'Y-m-d\TH:i') ?? '';
        return $mapped;
    }

    /**
     * @return array<string, string>
     */
    private function buildFormDataFromNotification(Notification $notification): array
    {
        return [
            'title' => $notification->getTitle(),
            'content' => $notification->getContentMarkdown(),
            'showFrom' => $this->formatDate($notification->getShowFrom(), 'Y-m-d\TH:i') ?? '',
            'showUntil' => $this->formatDate($notification->getShowUntil(), 'Y-m-d\TH:i') ?? '',
        ];
    }

    /**
     * @param array<string, string> $formData
     * @return array<string, string>
     */
    private function normalizeFormData(array $formData): array
    {
        return array_merge([
            'title' => '',
            'content' => '',
            'showFrom' => '',
            'showUntil' => '',
        ], $formData);
    }

    private function parseDateTime(string $value): ?\DateTime
    {
        $value = trim($value);
        if ($value === '') {
            return null;
        }

        try {
            $date = new \DateTime($value, $this->getDisplayTimeZone());
        } catch (\Exception $exception) {
            return null;
        }
        // Store in PHP's timezone: Doctrine saves the wall time without an offset.
        return $date->setTimezone(new \DateTimeZone(date_default_timezone_get()));
    }

    /**
     * Formats a date in the user's own timezone (see getDisplayTimeZone()).
     */
    private function formatDate(?\DateTimeInterface $date, string $format = 'd-m-Y H:i'): ?string
    {
        if ($date === null) {
            return null;
        }
        return \DateTimeImmutable::createFromInterface($date)->setTimezone($this->getDisplayTimeZone())->format($format);
    }

    /**
     * The browser's timezone, which Module.js and Plugin.js store in a cookie.
     * Falls back to PHP's timezone when the cookie is missing or invalid.
     */
    private function getDisplayTimeZone(): \DateTimeZone
    {
        if ($this->displayTimeZone === null) {
            $cookies = $this->request->getHttpRequest()->getCookieParams();
            $name = is_string($cookies[self::TIMEZONE_COOKIE] ?? null) ? $cookies[self::TIMEZONE_COOKIE] : '';
            $this->displayTimeZone = new \DateTimeZone(
                in_array($name, \DateTimeZone::listIdentifiers(), true) ? $name : date_default_timezone_get()
            );
        }
        return $this->displayTimeZone;
    }

    private function formatShowWindow(Notification $notification): string
    {
        $showFrom = $this->formatDate($notification->getShowFrom()) ?? $this->translate('showWindow.immediate');
        $showUntil = $this->formatDate($notification->getShowUntil()) ?? $this->translate('showWindow.unlimited');
        return $showFrom . ' – ' . $showUntil;
    }

    private function getInterfaceLanguage(): string
    {
        $user = $this->userService->getCurrentUser();
        if ($user !== null && $user->getPreferences() !== null) {
            return $user->getPreferences()->getInterfaceLanguage() ?: 'en';
        }
        return 'en';
    }

    /**
     * @param array<int, scalar> $arguments
     */
    private function translate(string $id, array $arguments = []): string
    {
        return $this->translator->translateById(
            $id,
            $arguments,
            null,
            new Locale($this->getInterfaceLanguage()),
            self::TRANSLATION_SOURCE,
            self::TRANSLATION_PACKAGE
        ) ?? $id;
    }
}
